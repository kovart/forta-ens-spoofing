
import { createAddress } from 'forta-agent-tools';
import { MockEthersProvider } from 'forta-agent-tools/lib/test';
import {EnsRegistryAbi, EnsResolver, EnsResolverAbi} from './resolver';
import { ethers } from 'ethers';

describe('EnsResolver', () => {
  const mockProvider = new MockEthersProvider();
  mockProvider.call = jest.fn();

  it('initializes properly', () => {
    const registryAddress = createAddress('0x1');
    const instance = new EnsResolver(registryAddress, mockProvider as any);
    expect(instance).toBeInstanceOf(EnsResolver);
  });

  // it("returns null if name doesn't exist", async () => {});

  it('generates namehash properly', async () => {
    const registryAddress = createAddress('0x1');
    const instance = new EnsResolver(registryAddress, mockProvider as any);
    expect(instance.namehash('foo.eth')).toStrictEqual(
      '0xde9b09fd7c5f901e23a3f19fecc54828e9c848539801e86591bd9801b019f84f',
    );
  });

  it('resolves name properly', async () => {
    const registryAddress = createAddress('0x101');
    const resolverAddress = createAddress('0x102');
    const accountName = 'foo.eth';
    const accountAddress = createAddress('0x012345');
    const blockNumber = 12345;

    mockProvider.addCallTo(
      registryAddress,
      blockNumber,
      new ethers.utils.Interface(EnsRegistryAbi),
      'resolver',
      {
        inputs: ['0xde9b09fd7c5f901e23a3f19fecc54828e9c848539801e86591bd9801b019f84f'],
        outputs: [resolverAddress],
      },
    );

    mockProvider.addCallTo(
      resolverAddress,
      blockNumber,
      new ethers.utils.Interface(EnsResolverAbi),
      'addr',
      {
        inputs: ['0xde9b09fd7c5f901e23a3f19fecc54828e9c848539801e86591bd9801b019f84f'],
        outputs: [accountAddress],
      },
    );

    const instance = new EnsResolver(registryAddress, mockProvider as any);

    const address = await instance.resolveName(accountName, blockNumber);

    expect(address).toStrictEqual(accountAddress);
  });
});
