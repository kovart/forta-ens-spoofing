import { Finding, FindingSeverity, FindingType } from 'forta-agent';

export const createFinding = (params: {
  originalName: string;
  originalAccount: string;
  impersonatingName: string;
  impersonatingAccount: string;
  developerAbbreviation: string;
}) => {
  const {
    originalName,
    originalAccount,
    impersonatingName,
    impersonatingAccount,
    developerAbbreviation,
  } = params;

  return Finding.from({
    alertId: `${developerAbbreviation}-ENS-SPOOFING-ETH`,
    name: 'Potential ENS Spoofing',
    description:
      `Account ${impersonatingAccount} registered "${impersonatingName}.eth" ENS name` +
      ` that is visually similar to "${originalName}.eth" of account ${originalAccount}`,
    type: FindingType.Suspicious,
    severity: FindingSeverity.Low,
    addresses: [originalAccount, impersonatingAccount],
    metadata: {
      originalName,
      originalAccount: originalAccount.toLowerCase(),
      impersonatingName,
      impersonatingAccount: impersonatingAccount.toLowerCase(),
    },
  });
};
