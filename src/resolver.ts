import sha3 from 'js-sha3';
import { Contract, ethers } from 'ethers';

// instead of using the built-in resolveName() function of ethers.js library,
// we implement our own resolver strategy that supports historical data

export const EnsRegistryAbi = [
  {
    constant: true,
    inputs: [{ internalType: 'bytes32', name: 'node', type: 'bytes32' }],
    name: 'resolver',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    payable: false,
    stateMutability: 'view',
    type: 'function',
  },
];

export const EnsResolverAbi = [
  {
    constant: true,
    inputs: [{ internalType: 'bytes32', name: 'node', type: 'bytes32' }],
    name: 'addr',
    outputs: [{ internalType: 'address payable', name: '', type: 'address' }],
    payable: false,
    stateMutability: 'view',
    type: 'function',
  },
];

export class EnsResolver {
  private provider: ethers.providers.JsonRpcProvider;
  private ensRegistryContract: Contract;
  private resolversByAddress: { [addr: string]: Contract } = {};

  constructor(ensRegistryAddress: string, provider: ethers.providers.JsonRpcProvider) {
    this.provider = provider;
    this.ensRegistryContract = new Contract(ensRegistryAddress, EnsRegistryAbi, this.provider);
  }

  public async resolveName(name: string, blockTag?: string | number): Promise<string | null> {
    const node = this.namehash(name);
    const resolverAddress = await this.ensRegistryContract.resolver(node, { blockTag });

    if (resolverAddress === ethers.constants.AddressZero) return null;

    const resolver =
      this.resolversByAddress[resolverAddress] ||
      new ethers.Contract(resolverAddress, EnsResolverAbi, this.provider);
    this.resolversByAddress[resolverAddress] = resolver;

    return await resolver.addr(node, { blockTag });
  }

  // https://github.com/Arachnid/eth-ens-namehash/blob/master/index.js
  public namehash(name: string) {
    // Reject empty names:
    let node = '';
    for (let i = 0; i < 32; i++) {
      node += '00';
    }

    if (name) {
      const labels = name.split('.');

      for (let i = labels.length - 1; i >= 0; i--) {
        const labelSha = sha3.keccak256(ethers.utils.toUtf8Bytes(labels[i]));
        node = sha3.keccak256(new Buffer(node + labelSha, 'hex'));
      }
    }

    return '0x' + node;
  }
}
