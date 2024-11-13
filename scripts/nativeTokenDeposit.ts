import { ethers } from 'ethers';
import fs from 'fs';

async function sendEthOrDepositERC20(
  erc20Inbox: ethers.Contract,
  l2Signer: ethers.Wallet
) {
  const configRaw = fs.readFileSync(
    './config/orbitSetupScriptConfig.json',
    'utf-8'
  );
  const config = JSON.parse(configRaw);
  const nativeToken = config.nativeToken;

  if (nativeToken === ethers.ZeroAddress) {
    // Send 0.01 ETH if nativeToken is zero address
    const inboxAddress = config.inbox;
    const depositEthAbi = [
      'function depositEth() public payable returns (uint256)',
    ];
    // Create contract instance
    const contract = new ethers.Contract(
      inboxAddress,
      depositEthAbi,
      l2Signer
    );

    console.log('Sending 0.01 ETH via depositEth...');
    const tx = await contract.depositEth.send({
      value: ethers.parseEther('0.01'),
    });
    console.log('Transaction hash on parent chain: ', tx.hash);
    await tx.wait();
    console.log('0.01 ETH has been deposited to your account');
  } else {
    const erc20Abi = [
      'function approve(address spender, uint256 amount) external returns (bool)',
      'function decimals() view returns (uint8)',
    ];
    const nativeTokenContract = new ethers.Contract(
      nativeToken,
      erc20Abi,
      l2Signer
    );

    console.log('Approving native token for deposit through inbox...');
    const approveTx = await nativeTokenContract.approve.send(
      erc20Inbox.address,
      ethers.MaxUint256
    );
    console.log('Transaction hash for approval: ', approveTx.hash);
    await approveTx.wait();

    // Call depositERC20 with 0.01 tokens if nativeToken is not zero address.
    const decimals = await nativeTokenContract.decimals();
    if (decimals !== 18n) {
      throw new Error('We currently only support tokens with 18 decimals');
    }
    const amount = ethers.parseUnits('0.01', Number(decimals));
    const tx = await erc20Inbox.depositERC20.send(amount);
    console.log('Transaction hash for depositERC20: ', tx.hash);
    await tx.wait();
    console.log('Native Token has been deposited');
  }
}

export async function ethOrERC20Deposit(
  privateKey: string,
  L2_RPC_URL: string
) {
  if (!privateKey || !L2_RPC_URL) {
    throw new Error('Required environment variable not found');
  }

  const l2Provider = new ethers.JsonRpcProvider(L2_RPC_URL);
  const l2Signer = new ethers.Wallet(privateKey, l2Provider);

  const configRaw = fs.readFileSync(
    './config/orbitSetupScriptConfig.json',
    'utf-8'
  );
  const config = JSON.parse(configRaw);
  const ERC20InboxAddress = config.inbox;

  const erc20InboxAbi = [
    'function depositERC20(uint256 amount) public returns (uint256)',
  ];
  const erc20Inbox = new ethers.Contract(
    ERC20InboxAddress,
    erc20InboxAbi,
    l2Signer
  );

  console.log('Sending ETH or depositing ERC20...');
  await sendEthOrDepositERC20(erc20Inbox, l2Signer);
}
