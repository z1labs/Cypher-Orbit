import { abi as ArbOwner__abi } from '@arbitrum/nitro-contracts/build/contracts/src/precompiles/ArbOwner.sol/ArbOwner.json';
import { abi as ArbGasInfo__abi } from '@arbitrum/nitro-contracts/build/contracts/src/precompiles/ArbGasInfo.sol/ArbGasInfo.json';
import { JsonRpcProvider, Wallet, Contract } from 'ethers';
import { L3Config } from './l3ConfigType';
import fs from 'fs';

export async function l3Configuration(
  privateKey: string,
  L2_RPC_URL: string,
  L3_RPC_URL: string
) {
  if (!privateKey || !L2_RPC_URL || !L3_RPC_URL) {
    throw new Error('Required environment variable not found');
  }

  // Generating providers from RPCs
  const L2Provider = new JsonRpcProvider(L2_RPC_URL);
  const L3Provider = new JsonRpcProvider(L3_RPC_URL);

  // Creating the wallet and signer
  const l2signer = new Wallet(privateKey, L2Provider);
  const l3signer = new Wallet(privateKey, L3Provider);

  // Read the JSON configuration
  const configRaw = fs.readFileSync(
    './config/orbitSetupScriptConfig.json',
    'utf-8'
  );
  const config: L3Config = JSON.parse(configRaw);

  // Reading params for L3 Configuration
  const minL2BaseFee = config.minL2BaseFee;
  const networkFeeReceiver = config.networkFeeReceiver;
  const infrastructureFeeCollector = config.infrastructureFeeCollector;
  const chainOwner = config.chainOwner;

  // Check if the Private Key provided is the chain owner:
  if (l3signer.address !== chainOwner) {
    throw new Error('The Private Key you have provided is not the chain owner');
  }

  // ArbOwner precompile setup
  const arbOwnerABI = ArbOwner__abi;

  // Arb Owner precompile address
  const arbOwnerAddress = '0x0000000000000000000000000000000000000070';
  const ArbOwner = new Contract(arbOwnerAddress, arbOwnerABI, l3signer);

  // Call the isChainOwner function and check the response
  const isSignerChainOwner = await ArbOwner.isChainOwner(l3signer.address);
  if (!isSignerChainOwner) {
    throw new Error('The address you have provided is not the chain owner');
  }

  // Set the network base fee
  console.log('Setting the Minimum Base Fee for the Orbit chain');

  // Ensure minL2BaseFee is a BigInt
  const minL2BaseFeeBigInt = BigInt(minL2BaseFee);

  const tx = await ArbOwner.setMinimumL2BaseFee(minL2BaseFeeBigInt);

  // Wait for the transaction to be mined
  const receipt = await tx.wait();
  console.log(
    `Minimum Base Fee is set on the block number ${receipt.blockNumber} on the Orbit chain`
  );

  // Check the status of the transaction: 1 is successful, 0 is failure
  if (receipt.status === 0) {
    throw new Error('Transaction failed, could not set the Minimum base fee');
  }

  // Set the network fee receiver
  console.log('Setting the network fee receiver for the Orbit chain');
  const tx2 = await ArbOwner.setNetworkFeeAccount(networkFeeReceiver);

  // Wait for the transaction to be mined
  const receipt2 = await tx2.wait();
  console.log(
    `Network fee receiver is set on the block number ${receipt2.blockNumber} on the Orbit chain`
  );

  // Check the status of the transaction: 1 is successful, 0 is failure
  if (receipt2.status === 0) {
    throw new Error('Setting network fee receiver transaction failed');
  }

  // Set the infrastructure fee collector
  console.log(
    'Setting the infrastructure fee collector address for the Orbit chain'
  );
  const tx3 = await ArbOwner.setInfraFeeAccount(infrastructureFeeCollector);

  // Wait for the transaction to be mined
  const receipt3 = await tx3.wait();
  console.log(
    `Infrastructure fee collector address is set on the block number ${receipt3.blockNumber} on the Orbit chain`
  );

  // Check the status of the transaction: 1 is successful, 0 is failure
  if (receipt3.status === 0) {
    throw new Error(
      'Setting the infrastructure fee collector transaction failed'
    );
  }

  // Setting L1 base fee on L3
  const arbGasInfoAbi = ArbGasInfo__abi;
  const arbGasInfoAddress = '0x000000000000000000000000000000000000006c';
  const ArbOGasInfo = new Contract(arbGasInfoAddress, arbGasInfoAbi, l2signer);

  console.log('Getting L1 base fee estimate');
  const l1BaseFeeEstimate = await ArbOGasInfo.getL1BaseFeeEstimate();
  console.log(`L1 Base Fee estimate on L2 is ${l1BaseFeeEstimate}`);

  const l2BaseFee = (await L2Provider.send("eth_gasPrice", []));

  // Both l1BaseFeeEstimate and l2BaseFee should be BigInts
  const totalGasPrice = l1BaseFeeEstimate + l2BaseFee;

  console.log(`Setting L1 base fee estimate on L3 to ${totalGasPrice}`);
  const tx4 = await ArbOwner.setL1PricePerUnit(totalGasPrice);

  // Wait for the transaction to be mined
  const receipt4 = await tx4.wait();
  console.log(
    `L1 base fee estimate is set on the block number ${receipt4.blockNumber} on the Orbit chain`
  );

  // Check the status of the transaction: 1 is successful, 0 is failure
  if (receipt4.status === 0) {
    throw new Error('Base Fee Setting failed');
  }

  console.log('All things done! Enjoy your Orbit chain. LFG 🚀🚀🚀🚀');
}
