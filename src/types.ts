import { providers } from 'ethers';
import { Logger } from './logger';

export type BotConfig = {
  developerAbbreviation: string;
  minASCIICharacters: number;
  maxASCIIReplacements: number;
};

export type DataContainer = {
  logger: Logger;
  provider: providers.JsonRpcProvider;
  config: BotConfig;
  isDevelopment: boolean;
  isInitialized: boolean;
};
