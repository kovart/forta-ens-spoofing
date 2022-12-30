import { providers } from 'ethers';
import { Logger } from './logger';
import { EnsResolver } from './resolver';

export type NormalizationConfig = {
  minASCIICharactersNumber: number;
  maxASCIICharactersNumber: number;
  maxASCIIHomoglyphsNumber: number;
  maxASCIIHomoglyphsPercent: number;
};

export type BotConfig = NormalizationConfig & {
  developerAbbreviation: string;
  ensRegistryAddress: string;
  ensEthRegistrarControllerAddress: string;
};

export type DataContainer = {
  logger: Logger;
  provider: providers.JsonRpcProvider;
  ensResolver: EnsResolver;
  config: BotConfig;
  isDevelopment: boolean;
  isInitialized: boolean;
};
