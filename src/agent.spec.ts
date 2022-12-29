import { HandleTransaction } from 'forta-agent';
import { TestTransactionEvent } from 'forta-agent-tools/lib/test';
import { createAddress } from 'forta-agent-tools';
import { ethers } from 'ethers';
import agent from './agent';
import { BotConfig, DataContainer } from './types';
import { Logger, LoggerLevel } from './logger';
import { createFinding } from './findings';
import { EnsResolver } from './resolver';
import { NAME_REGISTERED_EVENT } from './constants';

const { provideInitialize, provideHandleTransaction } = agent;

describe('ENS Spoofing bot', () => {
  describe('initialize()', () => {
    it('should initialize properly', async () => {
      const data: DataContainer = {} as any;
      const provider = new ethers.providers.JsonRpcProvider();
      const logger = new Logger();
      const config: BotConfig = {
        developerAbbreviation: 'AK',
        minASCIICharactersNumber: 5,
        maxASCIIHomoglyphsNumber: 4,
        maxASCIIHomoglyphsPercent: 30,
        ensRegistryAddress: createAddress('0x2'),
        ensEthRegistrarControllerAddress: createAddress('0x'),
      };

      const initialize = provideInitialize(data, config, provider, logger, true);

      await initialize();

      expect(data.isInitialized).toStrictEqual(true);
      expect(data.isDevelopment).toStrictEqual(true);
      expect(data.config).toStrictEqual(config);
      expect(data.ensResolver).toBeInstanceOf(EnsResolver);
      expect(data.logger).toStrictEqual(logger);
      expect(data.provider).toStrictEqual(provider);
    });
  });

  describe('handleTransaction()', () => {
    let mockData: DataContainer = {} as any;
    let mockProvider: jest.MockedObject<ethers.providers.StaticJsonRpcProvider>;
    let mockEnsResolver: jest.Mocked<EnsResolver>;
    let handleTransaction: HandleTransaction;

    let mockEnsNameDatabase: { [name: string]: string } = {}; // name -> address

    const autoAddress = (
      (count) => () =>
        createAddress('0x' + count++)
    )(0);
    const registerName = (name: string, account: string): void => {
      mockEnsNameDatabase[name] = account;
    };
    const clearRegisteredNames = (): void => {
      mockEnsNameDatabase = {};
    };
    const getENSRegisterTx = (names: { name: string; account: string }[]) => {
      const tx = new TestTransactionEvent();
      for (const { name, account } of names) {
        tx.addEventLog(NAME_REGISTERED_EVENT, mockData.config.ensEthRegistrarControllerAddress, [
          name,
          ethers.utils.keccak256(ethers.utils.toUtf8Bytes(name)),
          account,
          1e10,
          Date.now() + 1e8,
        ]);
      }
      return tx;
    };
    const generateName = (glyphs: string[] = [], length = 10) => {
      const symbols = 'abcdefghjklmnopq';

      const glyphsLength = glyphs.reduce((sum, curr) => sum + curr.length, 0);

      if (glyphsLength > length)
        throw new Error(
          `Glyphs length exceeds the desired name length. Glyphs length: ${glyphsLength}. Name length: ${length}`,
        );

      const name = symbols.repeat(Math.max(1, Math.ceil(length / symbols.length))).slice(0, length);
      const nameChars = Array.from(name);
      let shift = 0;
      for (const index in glyphs) {
        const position = Math.floor(
          Number(index) * (length / glyphs.length) + length / glyphs.length / 2,
        );

        nameChars.splice(position + shift, 1, glyphs[index]);
        shift += Array.from(glyphs[index]).length - 1;
      }

      return nameChars.join('');
    };

    beforeAll(() => {
      mockProvider = {} as any;
      mockEnsResolver = {
        resolveName: jest
          .fn()
          .mockImplementation(
            async (name: string) => mockEnsNameDatabase[name.slice(0, -4)] || null,
          ),
      } as any;

      mockData = {
        config: {
          developerAbbreviation: 'TEST',
          minASCIICharactersNumber: 1, // test purpose
          maxASCIIHomoglyphsNumber: 99, // test purpose
          maxASCIIHomoglyphsPercent: 99, // test purpose
          ensRegistryAddress: createAddress('0xFFEEDDCCBBAA'),
          ensEthRegistrarControllerAddress: createAddress('0xAABBCCDDEEFF'),
        },
        provider: mockProvider,
        ensResolver: mockEnsResolver,
        logger: new Logger(LoggerLevel.INFO),
        isDevelopment: false,
        isInitialized: true,
      } as DataContainer;
      handleTransaction = provideHandleTransaction(mockData);
    });

    beforeEach(() => {
      clearRegisteredNames();
      mockData.config = {
        ...mockData.config,
        minASCIICharactersNumber: 1,
        maxASCIIHomoglyphsNumber: 99,
        maxASCIIHomoglyphsPercent: 99,
      };
    });

    it('returns empty findings if there are no spoofed ENS names', async () => {
      mockData.config.minASCIICharactersNumber = 5;

      const pairs = [
        ['wildcat', 'wildcat1'],
        ['admin', 'admiin'],
        ['12345678', '12345679'],
        ['testname', 'testname-'],
        ['monkey', 'monkey🐍'],
        ['name / with separator', 'name | with separator'],
        ['', '    '],
      ];

      for (const pair of pairs) {
        registerName(pair[0], autoAddress());
        const findings = await handleTransaction(
          getENSRegisterTx(
            pair.slice(1).map((name) => ({
              name: name,
              account: autoAddress(),
            })),
          ),
        );
        expect(findings).toStrictEqual([]);
      }
    });

    it('returns empty findings if ENS name is short enough to be spoofed with ASCII homohlyphs', async () => {
      mockData.config.minASCIICharactersNumber = 8;

      const originalName = 'wildcat';
      const originalAccount = autoAddress();
      const impersonatingName = 'w1ldcat';
      const impersonatingAccount = autoAddress();

      registerName(originalName, originalAccount);

      const findings = await handleTransaction(
        getENSRegisterTx([
          {
            name: impersonatingName,
            account: impersonatingAccount,
          },
        ]),
      );

      expect(findings).toStrictEqual([]);
    });

    it('returns empty findings if ENS name has a large enough number of ASCII homoglyphs', async () => {
      // --------------------------
      // test 'maxASCIIHomoglyphsNumber'

      mockData.config.maxASCIIHomoglyphsNumber = 2; // max 2 homoglyph chars
      mockData.config.maxASCIIHomoglyphsPercent = 100; // all names should be passed

      let originalName = 'wildcat1';
      let originalAccount = autoAddress();
      let impersonatingName = 'w1lbcatl';
      let impersonatingAccount = autoAddress();

      registerName(originalName, originalAccount);

      let findings = await handleTransaction(
        getENSRegisterTx([
          {
            name: impersonatingName,
            account: impersonatingAccount,
          },
        ]),
      );

      expect(findings).toStrictEqual([]);

      // --------------------------
      // test 'maxASCIIHomoglyphsPercent'

      mockData.config.maxASCIIHomoglyphsNumber = 999;
      mockData.config.maxASCIIHomoglyphsPercent = 20; // 2 characters for a name 10 characters long

      originalName = 'wildcat100';
      originalAccount = autoAddress();
      impersonatingName = 'w1lbcatl00';
      impersonatingAccount = autoAddress();

      registerName(originalName, originalAccount);

      findings = await handleTransaction(
        getENSRegisterTx([
          {
            name: impersonatingName,
            account: impersonatingAccount,
          },
        ]),
      );

      expect(findings).toStrictEqual([]);

      // --------------------------
      // test case when the threshold is not exceeded

      mockData.config.maxASCIIHomoglyphsNumber = 3;
      mockData.config.maxASCIIHomoglyphsPercent = 30; // 3 characters for a name 10 characters long

      originalName = 'wildcat100';
      originalAccount = autoAddress();
      impersonatingName = 'vv1lḍCatl00'; // 3 ASCII homoglyphs + 1 uppercase + 1 unicode
      impersonatingAccount = autoAddress();

      registerName(originalName, originalAccount);

      findings = await handleTransaction(
        getENSRegisterTx([
          {
            name: impersonatingName,
            account: impersonatingAccount,
          },
        ]),
      );

      expect(findings).toStrictEqual([
        createFinding({
          originalName,
          originalAccount,
          impersonatingName,
          impersonatingAccount,
          developerAbbreviation: mockData.config.developerAbbreviation,
        }),
      ]);
    });

    it('returns a finding if ENS name was spoofed with ASCII homoglyphs', async () => {
      const glyphsBySymbol = {
        '0': ['o'],
        '1': ['l', 'i', '|'],
        b: ['d', 'lb'],
        c: ['e'],
        d: ['b'],
        e: ['c'],
        g: ['q'],
        h: ['lh'],
        i: ['1', 'l', '|'],
        k: ['lk', 'ik', 'lc'],
        l: ['1', 'i', '|'],
        m: ['n', 'nn', 'rn', 'rr'],
        n: ['m', 'r'],
        o: ['0'],
        q: ['g'],
        w: ['vv'],
      };

      for (const [symbol, glyphs] of Object.entries(glyphsBySymbol)) {
        const originalName = generateName([symbol]);
        const originalAccount = autoAddress();

        clearRegisteredNames();
        registerName(originalName, originalAccount);

        for (const glyph of glyphs) {
          const impersonatingName = generateName([glyph]);
          const impersonatingAccount = autoAddress();

          const findings = await handleTransaction(
            getENSRegisterTx([{ name: impersonatingName, account: impersonatingAccount }]),
          );

          expect(findings).toStrictEqual([
            createFinding({
              originalName,
              originalAccount,
              impersonatingName,
              impersonatingAccount,
              developerAbbreviation: mockData.config.developerAbbreviation,
            }),
          ]);
        }
      }

      // test multiple symbols simultaneously

      const originalName = '01aakaawaabc';
      const originalAccount = autoAddress();

      registerName(originalName, originalAccount);

      const impersonatingName = 'oiaaikaavvaabc';
      const impersonatingAccount = autoAddress();

      const findings = await handleTransaction(
        getENSRegisterTx([{ name: impersonatingName, account: impersonatingAccount }]),
      );

      expect(findings).toStrictEqual([
        createFinding({
          originalName,
          originalAccount,
          impersonatingName,
          impersonatingAccount,
          developerAbbreviation: mockData.config.developerAbbreviation,
        }),
      ]);
    });

    it('returns a finding if ENS name was spoofed with unicode homoglyphs', async () => {
      const glyphsBySymbol = {
        '2': ['ƻ'],
        '5': ['ƽ'],
        a: ['à', 'á', 'à', 'â', 'ã', 'ä', 'å', 'ɑ', 'ạ', 'ǎ', 'ă', 'ȧ', 'ą', 'ə'],
        b: ['ʙ', 'ɓ', 'ḃ', 'ḅ', 'ḇ', 'ƅ'],
        c: ['ƈ', 'ċ', 'ć', 'ç', 'č', 'ĉ', 'ᴄ'],
        d: ['ɗ', 'đ', 'ď', 'ɖ', 'ḑ', 'ḋ', 'ḍ', 'ḏ', 'ḓ'],
        e: ['é', 'è', 'ê', 'ë', 'ē', 'ĕ', 'ě', 'ė', 'ẹ', 'ę', 'ȩ', 'ɇ', 'ḛ'],
        f: ['ƒ', 'ḟ'],
        g: ['ɢ', 'ɡ', 'ġ', 'ğ', 'ǵ', 'ģ', 'ĝ', 'ǧ', 'ǥ'],
        h: ['ĥ', 'ȟ', 'ħ', 'ɦ', 'ḧ', 'ḩ', 'ⱨ', 'ḣ', 'ḥ', 'ḫ', 'ẖ'],
        i: ['í', 'ì', 'ï', 'ı', 'ɩ', 'ǐ', 'ĭ', 'ỉ', 'ị', 'ɨ', 'ȋ', 'ī', 'ɪ'],
        j: ['ʝ', 'ǰ', 'ɉ', 'ĵ'],
        k: ['ḳ', 'ḵ', 'ⱪ', 'ķ', 'ᴋ'],
        l: ['ɫ', 'ł'],
        m: ['ṁ', 'ṃ', 'ᴍ', 'ɱ', 'ḿ'],
        n: ['ń', 'ṅ', 'ṇ', 'ṉ', 'ñ', 'ņ', 'ǹ', 'ň', 'ꞑ'],
        o: ['ȯ', 'ọ', 'ỏ', 'ơ', 'ó', 'ö', 'ᴏ'],
        p: ['ƿ', 'ƥ', 'ṕ', 'ṗ'],
        q: ['ʠ'],
        r: ['ʀ', 'ɼ', 'ɽ', 'ŕ', 'ŗ', 'ř', 'ɍ', 'ɾ', 'ȓ', 'ȑ', 'ṙ', 'ṛ', 'ṟ'],
        s: ['ʂ', 'ś', 'ṣ', 'ṡ', 'ș', 'ŝ', 'š', 'ꜱ'],
        t: ['ţ', 'ŧ', 'ṫ', 'ṭ', 'ț', 'ƫ'],
        u: ['ᴜ', 'ǔ', 'ŭ', 'ü', 'ʉ', 'ù', 'ú', 'û', 'ũ', 'ū', 'ų', 'ư', 'ů', 'ű', 'ȕ', 'ȗ', 'ụ'],
        v: ['ṿ', 'ⱱ', 'ᶌ', 'ṽ', 'ⱴ', 'ᴠ'],
        w: ['ŵ', 'ẁ', 'ẃ', 'ẅ', 'ⱳ', 'ẇ', 'ẉ', 'ẘ', 'ᴡ'],
        x: ['ẋ', 'ẍ'],
        y: ['ʏ', 'ý', 'ÿ', 'ŷ', 'ƴ', 'ȳ', 'ɏ', 'ỿ', 'ẏ', 'ỵ'],
        z: ['ʐ', 'ż', 'ź', 'ᴢ', 'ƶ', 'ẓ', 'ẕ', 'ⱬ'],
      };

      for (const [symbol, glyphs] of Object.entries(glyphsBySymbol)) {
        const originalName = generateName([symbol]);
        const originalAccount = autoAddress();

        clearRegisteredNames();
        registerName(originalName, originalAccount);

        for (const glyph of glyphs) {
          const impersonatingName = generateName([glyph]);
          const impersonatingAccount = autoAddress();

          const findings = await handleTransaction(
            getENSRegisterTx([{ name: impersonatingName, account: impersonatingAccount }]),
          );

          expect(findings).toStrictEqual([
            createFinding({
              originalName,
              originalAccount,
              impersonatingName,
              impersonatingAccount,
              developerAbbreviation: mockData.config.developerAbbreviation,
            }),
          ]);
        }
      }

      // test multiple symbols simultaneously

      const originalName = 'aprapraaiui';
      const originalAccount = autoAddress();

      registerName(originalName, originalAccount);

      const impersonatingName = 'apraṗṛaaìᴜi';
      const impersonatingAccount = autoAddress();

      const findings = await handleTransaction(
        getENSRegisterTx([{ name: impersonatingName, account: impersonatingAccount }]),
      );

      expect(findings).toStrictEqual([
        createFinding({
          originalName,
          originalAccount,
          impersonatingName,
          impersonatingAccount,
          developerAbbreviation: mockData.config.developerAbbreviation,
        }),
      ]);
    });

    it('returns a finding if ENS name was spoofed with cyrillic homoglyphs', async () => {
      const glyphsBySymbol = {
        a: 'а',
        b: 'ь',
        c: 'с',
        d: 'ԁ',
        e: 'е',
        g: 'ԍ',
        h: 'һ',
        i: 'і',
        j: 'ј',
        k: 'к',
        l: 'ӏ',
        m: 'м',
        o: 'о',
        p: 'р',
        q: 'ԛ',
        s: 'ѕ',
        t: 'т',
        v: 'ѵ',
        w: 'ԝ',
        x: 'х',
        y: 'у',
      };

      for (const [symbol, glyph] of Object.entries(glyphsBySymbol)) {
        const originalName = generateName([symbol]);
        const originalAccount = autoAddress();

        clearRegisteredNames();
        registerName(originalName, originalAccount);

        const impersonatingName = generateName([glyph]);
        const impersonatingAccount = autoAddress();

        const findings = await handleTransaction(
          getENSRegisterTx([{ name: impersonatingName, account: impersonatingAccount }]),
        );

        expect(findings).toStrictEqual([
          createFinding({
            originalName,
            originalAccount,
            impersonatingName,
            impersonatingAccount,
            developerAbbreviation: mockData.config.developerAbbreviation,
          }),
        ]);
      }

      // test multiple symbols simultaneously

      const originalName = 'macmkok';
      const originalAccount = autoAddress();

      registerName(originalName, originalAccount);

      const impersonatingName = 'mасmкоk';
      const impersonatingAccount = autoAddress();

      const findings = await handleTransaction(
        getENSRegisterTx([{ name: impersonatingName, account: impersonatingAccount }]),
      );

      expect(findings).toStrictEqual([
        createFinding({
          originalName,
          originalAccount,
          impersonatingName,
          impersonatingAccount,
          developerAbbreviation: mockData.config.developerAbbreviation,
        }),
      ]);
    });

    it('returns a finding if ENS name was spoofed with uppercase characters', async () => {
      const originalName = 'bitcoin';
      const originalAccount = autoAddress();

      const impersonators = [
        {
          name: 'Bitcoin',
          account: autoAddress(),
        },
        {
          name: 'bItcoIn',
          account: autoAddress(),
        },
        {
          name: 'bitcoiN',
          account: autoAddress(),
        },
      ];

      registerName(originalName, originalAccount);

      for (const impersonator of impersonators) {
        const findings = await handleTransaction(getENSRegisterTx([impersonator]));

        expect(findings).toStrictEqual([
          createFinding({
            originalName,
            originalAccount,
            impersonatingName: impersonator.name,
            impersonatingAccount: impersonator.account,
            developerAbbreviation: mockData.config.developerAbbreviation,
          }),
        ]);
      }
    });

    it('returns a finding if ENS name was spoofed with non-printable characters', async () => {
      // https://github.com/spencermountain/out-of-character/blob/main/data/characters.json
      const invisibleChars = [
        ' ',
        '\n',
        '\r',
        '\u{000A}',
        '\u{000B}',
        '\u{000C}',
        '\u{000D}',
        '\u{00A0}',
        '\u{0085}',
        '\u{2028}',
        '\u{2029}',
        '\u{0009}',
        '\u{0020}',
        '\u{00AD}',
        '\u{034F}',
        '\u{061C}',
        '\u{070F}',
        '\u{115F}',
        '\u{1160}',
        '\u{1680}',
        '\u{17B4}',
        '\u{17B5}',
        '\u{180E}',
        '\u{2000}',
        '\u{2001}',
        '\u{2002}',
        '\u{2003}',
        '\u{2004}',
        '\u{2005}',
        '\u{2006}',
        '\u{2007}',
        '\u{2008}',
        '\u{2009}',
        '\u{200A}',
        '\u{200B}',
        '\u{200C}',
        '\u{200D}',
        '\u{200E}',
        '\u{200F}',
        '\u{202F}',
        '\u{205F}',
        '\u{2060}',
        '\u{2061}',
        '\u{2062}',
        '\u{2063}',
        '\u{2064}',
        '\u{206A}',
        '\u{206B}',
        '\u{206C}',
        '\u{206D}',
        '\u{206E}',
        '\u{206F}',
        '\u{3000}',
        '\u{2800}',
        '\u{3164}',
        '\u{FEFF}',
        '\u{FFA0}',
        '\u{110B1}',
        '\u{1BCA0}',
        '\u{1BCA1}',
        '\u{1BCA2}',
        '\u{1BCA3}',
        '\u{1D159}',
        '\u{1D173}',
        '\u{1D174}',
        '\u{1D175}',
        '\u{1D176}',
        '\u{1D177}',
        '\u{1D178}',
        '\u{1D179}',
        '\u{1D17A}',
      ];

      const originalName = generateName([]);
      const originalAccount = autoAddress();

      registerName(originalName, originalAccount);

      for (const char of invisibleChars) {
        // insert invisible characters into specific positions
        const nameChars = Array.from(originalName);
        for (const position of [0, 2, originalName.length + 2, originalName.length + 3]) {
          nameChars.splice(position, 0, char);
        }

        const impersonatingName = nameChars.join('');
        const impersonatingAccount = autoAddress();

        const findings = await handleTransaction(
          getENSRegisterTx([
            {
              name: impersonatingName,
              account: impersonatingAccount,
            },
          ]),
        );

        expect(findings).toStrictEqual([
          createFinding({
            originalName,
            originalAccount,
            impersonatingName,
            impersonatingAccount,
            developerAbbreviation: mockData.config.developerAbbreviation,
          }),
        ]);
      }

      // test multiple symbols simultaneously

      const impersonatingName =
        '\u0020' +
        originalName.slice(0, 3) +
        '\u000A' +
        originalName.slice(3) +
        '\u2800' +
        '\u200C';
      const impersonatingAccount = autoAddress();

      const findings = await handleTransaction(
        getENSRegisterTx([{ name: impersonatingName, account: impersonatingAccount }]),
      );

      expect(findings).toStrictEqual([
        createFinding({
          originalName,
          originalAccount,
          impersonatingName,
          impersonatingAccount,
          developerAbbreviation: mockData.config.developerAbbreviation,
        }),
      ]);
    });

    it('returns a finding if ENS name was spoofed with multiple homoglyph techniques', async () => {
      const originalName = 'wildcat';
      const originalAccount = autoAddress();

      const impersonatingName =
        'W' /* capitalized */ +
        '1' /* similar looking ASCII */ +
        'ӏ' /* cyrillic */ +
        'd' +
        'ċ' /* unicode */ +
        'at' +
        '\u00A0'; /* invisible symbol */
      const impersonatingAccount = autoAddress();

      registerName(originalName, originalAccount);

      const findings = await handleTransaction(
        getENSRegisterTx([{ name: impersonatingName, account: impersonatingAccount }]),
      );

      expect(findings).toStrictEqual([
        createFinding({
          originalName,
          originalAccount,
          impersonatingName,
          impersonatingAccount,
          developerAbbreviation: mockData.config.developerAbbreviation,
        }),
      ]);
    });

    it('returns multiple findings', async () => {
      const originalName1 = 'wildcat';
      const originalAccount1 = autoAddress();
      const originalName2 = 'legit';
      const originalAccount2 = autoAddress();

      const impersonatingName1 = 'Wildcat';
      const impersonatingAccount1 = autoAddress();
      const impersonatingName2 = 'w1ldcat';
      const impersonatingAccount2 = autoAddress();
      const impersonatingName3 = 'legit' + '\u000A';
      const impersonatingAccount3 = autoAddress();

      registerName(originalName1, originalAccount1);
      registerName(originalName2, originalAccount2);

      const findings = await handleTransaction(
        getENSRegisterTx([
          { name: impersonatingName1, account: impersonatingAccount1 },
          { name: impersonatingName2, account: impersonatingAccount2 },
          { name: impersonatingName3, account: impersonatingAccount3 },
        ]),
      );

      expect(findings).toStrictEqual([
        createFinding({
          originalName: originalName1,
          originalAccount: originalAccount1,
          impersonatingName: impersonatingName1,
          impersonatingAccount: impersonatingAccount1,
          developerAbbreviation: mockData.config.developerAbbreviation,
        }),
        createFinding({
          originalName: originalName1,
          originalAccount: originalAccount1,
          impersonatingName: impersonatingName2,
          impersonatingAccount: impersonatingAccount2,
          developerAbbreviation: mockData.config.developerAbbreviation,
        }),
        createFinding({
          originalName: originalName2,
          originalAccount: originalAccount2,
          impersonatingName: impersonatingName3,
          impersonatingAccount: impersonatingAccount3,
          developerAbbreviation: mockData.config.developerAbbreviation,
        }),
      ]);
    });
  });
});
