import { Finding, FindingSeverity, FindingType } from 'forta-agent';

export const createFinding = (params: {
  legitName: string;
  legitAccount: string;
  impersonatingName: string;
  impersonatingAccount: string;
  developerAbbreviation: string;
}) => {
  const {
    legitName,
    legitAccount,
    impersonatingName,
    impersonatingAccount,
    developerAbbreviation,
  } = params;

  return Finding.from({
    alertId: `${developerAbbreviation}-ENS-SPOOFING`,
    name: 'Potential ENS Spoofing',
    description:
      `Account ${impersonatingAccount} registered "${impersonatingName}.eth" ENS name` +
      ` that is visually similar to "${legitName}.eth" of account ${legitAccount}`,
    type: FindingType.Suspicious,
    severity: FindingSeverity.Low,
    addresses: [legitAccount, impersonatingAccount],
    metadata: {
      legitName,
      legitAccount: legitAccount.toLowerCase(),
      impersonatingName,
      impersonatingAccount: impersonatingAccount.toLowerCase(),
    },
  });
};
