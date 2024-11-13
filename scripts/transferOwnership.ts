import { ethers, Wallet, JsonRpcProvider, Contract, Interface } from 'ethers';
import UpgradeExecutor from '@arbitrum/nitro-contracts/build/contracts/src/mocks/UpgradeExecutorMock.sol/UpgradeExecutorMock.json';
import ArbOwner from '@arbitrum/nitro-contracts/build/contracts/src/precompiles/ArbOwner.sol/ArbOwner.json';
import fs from 'fs';
import { L3Config } from './l3ConfigType';
import { TOKEN_BRIDGE_CREATOR_Arb_Sepolia } from './createTokenBridge';
import L1AtomicTokenBridgeCreator from '@arbitrum/token-bridge-contracts/build/contracts/contracts/tokenbridge/ethereum/L1AtomicTokenBridgeCreator.sol/L1AtomicTokenBridgeCreator.json';

export const getSigner = (provider: JsonRpcProvider, key: string) => {
  if (!key) throw new Error('Private key is required.');
  return new Wallet(key, provider);
};

const ARB_OWNER_ADDRESS = '0x0000000000000000000000000000000000000070';

export async function transferOwner(
  privateKey: string,
  l2Provider: ethers.JsonRpcProvider,
  l3Provider: ethers.JsonRpcProvider
) {
  // Generating l2 and l3 deployer signers from privateKey and providers
  const l3Deployer = getSigner(l3Provider, privateKey);

  // Fetching chain ID of parent chain
  const l2ChainId = (await l2Provider.getNetwork()).chainId;

  let TOKEN_BRIDGE_CREATOR;
  if (l2ChainId === BigInt(421614)) {
    TOKEN_BRIDGE_CREATOR = TOKEN_BRIDGE_CREATOR_Arb_Sepolia;
  } else {
    throw new Error(
      'The Base Chain you have provided is not supported. Please use RPC for Arb Sepolia.'
    );
  }

  // Read the JSON configuration
  const configRaw = fs.readFileSync(
    './config/orbitSetupScriptConfig.json',
    'utf-8'
  );
  const config: L3Config = JSON.parse(configRaw);

  const l1TokenBridgeCreator = new Contract(
    TOKEN_BRIDGE_CREATOR,
    L1AtomicTokenBridgeCreator.abi,
    l2Provider
  );

  // Fetching L3 upgrade executor address
  const inboxToL2Deployment = await l1TokenBridgeCreator.inboxToL2Deployment(
    config.inbox
  );
  const executorContractAddress = inboxToL2Deployment.upgradeExecutor;

  // Defining ArbOwner precompile contract
  const ArbOwnerContract = new Contract(
    ARB_OWNER_ADDRESS,
    ArbOwner.abi,
    l3Deployer
  );

  console.log('Adding Upgrade Executor contract to the chain owners');
  const addChainOwnerTx = await ArbOwnerContract.addChainOwner(
    executorContractAddress
  );
  const receipt1 = await addChainOwnerTx.wait();
  console.log(
    'Executor has been added to chain owners on TX:',
    receipt1.transactionHash
  );

  // Defining Upgrade Executor contract
  const upgradeExecutor = new Contract(
    executorContractAddress,
    UpgradeExecutor.abi,
    l3Deployer
  );

  // Constructing call data for removing rollup owner from chain owners on L3
  const arbOwnerInterface = new Interface(ArbOwner.abi);
  const targetCallData = arbOwnerInterface.encodeFunctionData(
    'removeChainOwner',
    [l3Deployer.address]
  );

  console.log(
    'Executing removeChainOwner through the Upgrade Executor contract'
  );
  const executeCallTx = await upgradeExecutor.executeCall(
    ARB_OWNER_ADDRESS,
    targetCallData
  );
  const receipt2 = await executeCallTx.wait();
  console.log(
    'Transaction complete, rollup owner removed from chain owners on TX:',
    receipt2.transactionHash
  );
}
