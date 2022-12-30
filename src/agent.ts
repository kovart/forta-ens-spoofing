import { providers } from 'ethers';
import {
  Finding,
  Initialize,
  HandleTransaction,
  TransactionEvent,
  getEthersBatchProvider,
} from 'forta-agent';
import { queue } from 'async';
import { Logger, LoggerLevel } from './logger';
import { EnsResolver } from './resolver';
import { createFinding } from './findings';
import { getNormalizedNameVariants } from './utils';
import { NAME_REGISTERED_EVENT } from './constants';
import { BotConfig, DataContainer } from './types';

const data: DataContainer = {} as any;
const provider = getEthersBatchProvider();
const isDevelopment = process.env.NODE_ENV !== 'production';
const logger = new Logger(isDevelopment ? LoggerLevel.DEBUG : LoggerLevel.INFO);
const botConfig: BotConfig = require('../bot-config.json');

const provideInitialize = (
  data: DataContainer,
  config: BotConfig,
  provider: providers.JsonRpcProvider,
  logger: Logger,
  isDevelopment: boolean,
): Initialize => {
  return async function initialize() {
    data.logger = logger;
    data.config = config;
    data.provider = provider;
    data.isDevelopment = isDevelopment;
    data.ensResolver = new EnsResolver(data.config.ensRegistryAddress, data.provider);
    data.isInitialized = true;

    logger.debug('Initialized');
  };
};

const provideHandleTransaction = (data: DataContainer): HandleTransaction => {
  return async function handleTransaction(txEvent: TransactionEvent) {
    if (!data.isInitialized) throw new Error('DataContainer is not initialized');

    const findings: Finding[] = [];

    const events = txEvent.filterLog(
      NAME_REGISTERED_EVENT,
      data.config.ensEthRegistrarControllerAddress,
    );

    if (events.length > 0) {
      data.logger.info(`Detected register events: ${events.map((e) => e.args.name).join(', ')}`);
    }

    for (const event of events) {
      const { name, owner } = event.args;

      const normalizedNames = getNormalizedNameVariants(name, data.config);

      data.logger.debug(`Name variants for ${name}: `, normalizedNames.length);

      let counter = 0;
      const similarLookingRecords: { name: string; account: string }[] = [];
      const nameQueue = queue<string>(async (name, callback) => {
        const account = await data.ensResolver.resolveName(name + '.eth', txEvent.blockNumber);
        data.logger.debug(
          `Checked name variant ${++counter}/${normalizedNames.length}:`,
          name,
          account,
        );
        if (account) {
          similarLookingRecords.push({ name, account });
        }
        callback();
      }, 4);

      if (normalizedNames.length > 0) {
        nameQueue.push(normalizedNames);
        await nameQueue.drain();
      }

      if (similarLookingRecords.length > 0) {
        for (const record of similarLookingRecords) {
          findings.push(
            createFinding({
              originalName: record.name,
              originalAccount: record.account,
              impersonatingName: name,
              impersonatingAccount: owner,
              developerAbbreviation: data.config.developerAbbreviation,
            }),
          );
        }
      }
    }

    return findings;
  };
};

export default {
  initialize: provideInitialize(data, botConfig, provider, logger, isDevelopment),
  handleTransaction: provideHandleTransaction(data),

  provideInitialize,
  provideHandleTransaction,
};
