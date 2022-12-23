import { HandleTransaction } from 'forta-agent';
import { TestTransactionEvent } from 'forta-agent-tools/lib/test';
import { createAddress } from 'forta-agent-tools';
import { ethers } from 'ethers';
import agent from './agent';
import { BotConfig, DataContainer } from './types';
import { Logger, LoggerLevel } from './logger';
import { createFinding } from './findings';

const { provideInitialize, provideHandleTransaction } = agent;

describe('ENS Spoofing bot', () => {
  describe('initialize()', () => {
    it('should initialize properly', async () => {
      const data: DataContainer = {} as any;
      const provider = new ethers.providers.JsonRpcProvider();
      const logger = new Logger();
      const config: BotConfig = {
        developerAbbreviation: 'AK',
        minASCIICharacters: 5,
        maxASCIIHomoglyphs: 4,
        ethRegistrarControllerAddress: createAddress('0x'),
      };

      const initialize = provideInitialize(data, config, provider, logger, true);

      await initialize();

      expect(data.isInitialized).toStrictEqual(true);
      expect(data.isDevelopment).toStrictEqual(true);
      expect(data.config).toStrictEqual(config);
      expect(data.logger).toStrictEqual(logger);
      expect(data.provider).toStrictEqual(provider);
    });
  });

  describe('handleTransaction()', () => {
    let mockData: DataContainer = {} as any;
    let mockProvider: jest.MockedObject<ethers.providers.StaticJsonRpcProvider>;
    let handleTransaction: HandleTransaction;

    const autoAddress = (
      (count) => () =>
        createAddress('0x' + count++)
    )(0);
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    const registerName = (name: string, account: string): void => {};
    const getENSRegisterTx = (names: { name: string; account: string }[]) => {
      return new TestTransactionEvent();
    };
    const generateName = (injectGlyphs: string[] = [], repeatCount = 1, length = 7) => {
      const symbols = 'abcdefghijklmnopqstvwxy';
      const glyphsStack = [];

      for (let i = 0; i < repeatCount; i++) {
        glyphsStack.push(...injectGlyphs);
      }

      if (glyphsStack.length > length)
        throw new Error(
          `The number of glyphs exceeds the desired name length. Glyphs: ${injectGlyphs.length}. Length: ${length}`,
        );

      let name = symbols.repeat(Math.max(1, Math.ceil(length / symbols.length))).slice(0, length);
      for (const index in glyphsStack) {
        const position = Math.floor(
          Number(index) * (length / glyphsStack.length) + length / glyphsStack.length / 2,
        );
        name = name.slice(0, position - 1) + glyphsStack[index] + name.slice(position, length);
      }

      return name;
    };

    beforeAll(() => {
      mockData = {
        logger: new Logger(LoggerLevel.DEBUG),
        addressesByName: new Map(),
        provider: mockProvider,
        config: {
          developerAbbreviation: 'TEST',
          minASCIICharacters: 5,
          maxASCIIHomoglyphs: 4,
          ethRegistrarControllerAddress: createAddress('0xAABBCCDDEEFF'),
        },
        isDevelopment: false,
        isInitialized: true,
      } as DataContainer;
      handleTransaction = provideHandleTransaction(mockData);
    });

    it('returns empty findings if there are no spoofed ENS names', async () => {
      mockData.config.minASCIICharacters = 5;

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
      mockData.config.minASCIICharacters = 8;

      const legitName = 'wildcat';
      const legitAccount = autoAddress();
      const impersonatingName = 'w1ldcat';
      const impersonatingAccount = autoAddress();

      registerName(legitName, legitAccount);

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
        const legitName = generateName([symbol]);
        const legitAccount = autoAddress();

        registerName(legitName, legitAccount);

        for (const glyph of glyphs) {
          const impersonatingName = generateName([glyph]);
          const impersonatingAccount = autoAddress();

          const findings = await handleTransaction(
            getENSRegisterTx([{ name: impersonatingName, account: impersonatingAccount }]),
          );

          expect(findings).toStrictEqual([
            createFinding({
              legitName,
              legitAccount,
              impersonatingName,
              impersonatingAccount,
              developerAbbreviation: mockData.config.developerAbbreviation,
            }),
          ]);
        }
      }

      // test multiple symbols simultaneously

      const legitName = generateName(['0', '1', 'k', 'w'], 1, 10);
      const legitAccount = autoAddress();

      const impersonatingName = generateName(['o', 'i', 'ik', 'vv'], 1, 10);
      const impersonatingAccount = autoAddress();

      const findings = await handleTransaction(
        getENSRegisterTx([{ name: impersonatingName, account: impersonatingAccount }]),
      );

      expect(findings).toStrictEqual([
        createFinding({
          legitName,
          legitAccount,
          impersonatingName,
          impersonatingAccount,
          developerAbbreviation: mockData.config.developerAbbreviation,
        }),
      ]);
    });

    it('returns a finding if ENS name was spoofed with unicode homoglyphs', async () => {
      // we should detect the use of unicode homoglyphs with any number of ASCII characters
      mockData.config.minASCIICharacters = 1;

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
        const legitName = generateName([symbol]);
        const legitAccount = autoAddress();

        registerName(legitName, legitAccount);

        for (const glyph of glyphs) {
          const impersonatingName = generateName([glyph]);
          const impersonatingAccount = autoAddress();

          const findings = await handleTransaction(
            getENSRegisterTx([{ name: impersonatingName, account: impersonatingAccount }]),
          );

          expect(findings).toStrictEqual([
            createFinding({
              legitName,
              legitAccount,
              impersonatingName,
              impersonatingAccount,
              developerAbbreviation: mockData.config.developerAbbreviation,
            }),
          ]);
        }
      }

      // test multiple symbols simultaneously

      const legitName = generateName(['p', 'r', 'i', 'u'], 1, 10);
      const legitAccount = autoAddress();

      const impersonatingName = generateName(['ṗ', 'ṛ', 'ì', 'ᴜ'], 1, 10);
      const impersonatingAccount = autoAddress();

      const findings = await handleTransaction(
        getENSRegisterTx([{ name: impersonatingName, account: impersonatingAccount }]),
      );

      expect(findings).toStrictEqual([
        createFinding({
          legitName,
          legitAccount,
          impersonatingName,
          impersonatingAccount,
          developerAbbreviation: mockData.config.developerAbbreviation,
        }),
      ]);
    });

    it('returns a finding if ENS name was spoofed with cyrillic homoglyphs', async () => {
      // we should detect the use of cyrillic homoglyphs with any number of ASCII characters
      mockData.config.minASCIICharacters = 1;

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
        const legitName = generateName([symbol]);
        const legitAccount = autoAddress();

        registerName(legitName, legitAccount);

        const impersonatingName = generateName([glyph]);
        const impersonatingAccount = autoAddress();

        const findings = await handleTransaction(
          getENSRegisterTx([{ name: impersonatingName, account: impersonatingAccount }]),
        );

        expect(findings).toStrictEqual([
          createFinding({
            legitName,
            legitAccount,
            impersonatingName,
            impersonatingAccount,
            developerAbbreviation: mockData.config.developerAbbreviation,
          }),
        ]);
      }

      // test multiple symbols simultaneously

      const legitName = generateName(['a', 'c', 'k', 'o'], 1, 10);
      const legitAccount = autoAddress();

      const impersonatingName = generateName(['а', 'с', 'к', 'о'], 1, 10);
      const impersonatingAccount = autoAddress();

      const findings = await handleTransaction(
        getENSRegisterTx([{ name: impersonatingName, account: impersonatingAccount }]),
      );

      expect(findings).toStrictEqual([
        createFinding({
          legitName,
          legitAccount,
          impersonatingName,
          impersonatingAccount,
          developerAbbreviation: mockData.config.developerAbbreviation,
        }),
      ]);
    });

    it('returns a finding if ENS name was spoofed with uppercase characters', async () => {
      const legitName = 'bitcoin';
      const legitAccount = autoAddress();

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

      registerName(legitName, legitAccount);

      for (const impersonator of impersonators) {
        const findings = await handleTransaction(getENSRegisterTx([impersonator]));

        expect(findings).toStrictEqual([
          createFinding({
            legitName,
            legitAccount,
            impersonatingName: impersonator.name,
            impersonatingAccount: impersonator.account,
            developerAbbreviation: mockData.config.developerAbbreviation,
          }),
        ]);
      }
    });

    it('returns a finding if ENS name was spoofed with non-printable characters', async () => {
      // we should detect the use of non-printable homoglyphs with any number of ASCII characters
      mockData.config.minASCIICharacters = 1;

      // https://github.com/spencermountain/out-of-character/blob/main/data/characters.json
      const invisibleSymbols = [
        '\u000A',
        '\u000B',
        '\u000C',
        '\u000D',
        '\u00A0',
        '\u0085',
        '\u2028',
        '\u2029',
        '\u0009',
        '\u0020',
        '\u00AD',
        '\u034F',
        '\u061C',
        '\u070F',
        '\u115F',
        '\u1160',
        '\u1680',
        '\u17B4',
        '\u17B5',
        '\u180E',
        '\u2000',
        '\u2001',
        '\u2002',
        '\u2003',
        '\u2004',
        '\u2005',
        '\u2006',
        '\u2007',
        '\u2008',
        '\u2009',
        '\u200A',
        '\u200B',
        '\u200C',
        '\u200D',
        '\u200E',
        '\u200F',
        '\u202F',
        '\u205F',
        '\u2060',
        '\u2061',
        '\u2062',
        '\u2063',
        '\u2064',
        '\u206A',
        '\u206B',
        '\u206C',
        '\u206D',
        '\u206E',
        '\u206F',
        '\u3000',
        '\u2800',
        '\u3164',
        '\uFEFF',
        '\uFFA0',
        '\u110B1',
        '\u1BCA0',
        '\u1BCA1',
        '\u1BCA2',
        '\u1BCA3',
        '\u1D159',
        '\u1D173',
        '\u1D174',
        '\u1D175',
        '\u1D176',
        '\u1D177',
        '\u1D178',
        '\u1D179',
        '\u1D17A',
      ];

      const legitName = generateName([], 1);
      const legitAccount = autoAddress();

      registerName(legitName, legitAccount);

      for (const symbol of invisibleSymbols) {
        // insert invisible characters into specific positions
        const nameChars = Array.from(legitName);
        for (const position of [0, 2, legitName.length + 2, legitName.length + 3]) {
          nameChars.splice(position, 0, symbol);
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
            legitName,
            legitAccount,
            impersonatingName,
            impersonatingAccount,
            developerAbbreviation: mockData.config.developerAbbreviation,
          }),
        ]);
      }

      // test multiple symbols simultaneously

      const impersonatingName =
        '\u0020' + legitName.slice(0, 3) + '\u000A' + legitName.slice(3) + '\u2800' + '\u200C';
      const impersonatingAccount = autoAddress();

      const findings = await handleTransaction(
        getENSRegisterTx([{ name: impersonatingName, account: impersonatingAccount }]),
      );

      expect(findings).toStrictEqual([
        createFinding({
          legitName,
          legitAccount,
          impersonatingName,
          impersonatingAccount,
          developerAbbreviation: mockData.config.developerAbbreviation,
        }),
      ]);
    });

    it('returns a finding if ENS name was spoofed with multiple homoglyph techniques', async () => {
      const legitName = 'wildcat';
      const legitAccount = autoAddress();

      const impersonatingName =
        'W' /* capitalized */ +
        '1' /* similar looking ASCII */ +
        'ӏ' /* cyrillic */ +
        'd' +
        'ċ' /* unicode */ +
        'at' +
        '\u00A0'; /* invisible symbol */
      const impersonatingAccount = autoAddress();

      const findings = await handleTransaction(
        getENSRegisterTx([{ name: impersonatingName, account: impersonatingAccount }]),
      );

      expect(findings).toStrictEqual([
        createFinding({
          legitName,
          legitAccount,
          impersonatingName,
          impersonatingAccount,
          developerAbbreviation: mockData.config.developerAbbreviation,
        }),
      ]);
    });

    it('returns multiple findings', async () => {
      const legitName1 = 'wildcat';
      const legitAccount1 = autoAddress();
      const legitName2 = 'legit';
      const legitAccount2 = autoAddress();

      const impersonatingName1 = 'Wildcat';
      const impersonatingAccount1 = autoAddress();
      const impersonatingName2 = 'w1ldcat';
      const impersonatingAccount2 = autoAddress();
      const impersonatingName3 = 'legit' + '\u000A';
      const impersonatingAccount3 = autoAddress();

      registerName(legitName1, legitAccount1);
      registerName(legitName2, legitAccount2);

      const findings = await handleTransaction(
        getENSRegisterTx([
          { name: impersonatingName1, account: impersonatingAccount1 },
          { name: impersonatingName2, account: impersonatingAccount2 },
          { name: impersonatingName3, account: impersonatingAccount3 },
        ]),
      );

      expect(findings).toStrictEqual([
        createFinding({
          legitName: legitName1,
          legitAccount: legitAccount1,
          impersonatingName: impersonatingName1,
          impersonatingAccount: impersonatingAccount1,
          developerAbbreviation: mockData.config.developerAbbreviation,
        }),
        createFinding({
          legitName: legitName1,
          legitAccount: legitAccount1,
          impersonatingName: impersonatingName2,
          impersonatingAccount: impersonatingAccount2,
          developerAbbreviation: mockData.config.developerAbbreviation,
        }),
        createFinding({
          legitName: legitName2,
          legitAccount: legitAccount2,
          impersonatingName: impersonatingName3,
          impersonatingAccount: impersonatingAccount3,
          developerAbbreviation: mockData.config.developerAbbreviation,
        }),
      ]);
    });
  });
});
