import { ethers } from 'hardhat';
import { IAlgebraCustomPoolEntryPoint, IAlgebraFactory, MockToken } from '../../typechain-types';
import AlgebraFactoryJson
  from "@cryptoalgebra/integral-core/artifacts/contracts/AlgebraFactory.sol/AlgebraFactory.json";
import AlgebraCustomPoolEntryPointJson
  from "@cryptoalgebra/integral-periphery/artifacts/contracts/AlgebraCustomPoolEntryPoint.sol/AlgebraCustomPoolEntryPoint.json"
import AlgebraPoolDeployer
  from "@cryptoalgebra/integral-core/artifacts/contracts/AlgebraPoolDeployer.sol/AlgebraPoolDeployer.json"
import { getCreateAddress } from "ethers";
import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers';

type Fixture<T> = () => Promise<T>;

export interface TokensFixture {
  token0: MockToken;
  token1: MockToken;
}

export async function tokensFixture(): Promise<TokensFixture> {
  const tokenFactory = await ethers.getContractFactory('MockToken');
  const tokenA = (await tokenFactory.deploy("TokenA", "TKNA")) as any as MockToken & { address: string };
  const tokenB = (await tokenFactory.deploy("TokenB", "TKNB")) as any as MockToken & { address: string };

  tokenA.address = await tokenA.getAddress();
  tokenB.address = await tokenB.getAddress();

  const [token0, token1] = [tokenA, tokenB].sort((_tokenA, _tokenB) => (_tokenA.address.toLowerCase() < _tokenB.address.toLowerCase() ? -1 : 1));

  return { token0, token1 };
}

interface EntrypointFixture extends TokensFixture {
  signers: HardhatEthersSigner[];
  factory: IAlgebraFactory;
  customEntrypoint: IAlgebraCustomPoolEntryPoint;
}

export const entrypointFixture: Fixture<EntrypointFixture> = async function (): Promise<EntrypointFixture> {

  const { token0, token1 } = await tokensFixture();

  const signers = await ethers.getSigners();

  const poolDeployerAddress = getCreateAddress({
    from: signers[0].address,
    nonce: (await ethers.provider.getTransactionCount(signers[0].address)) + 1,
  });

  const v3FactoryFactory = await ethers.getContractFactory(AlgebraFactoryJson.abi, AlgebraFactoryJson.bytecode);
  const _factory = (await v3FactoryFactory.deploy(poolDeployerAddress)) as any as IAlgebraFactory;

  const poolDeployerFactory = await ethers.getContractFactory(AlgebraPoolDeployer.abi, AlgebraPoolDeployer.bytecode);
  await poolDeployerFactory.deploy(_factory);

  const customEntrypointFactory = await ethers.getContractFactory(AlgebraCustomPoolEntryPointJson.abi, AlgebraCustomPoolEntryPointJson.bytecode);
  const _customEntrypoint = (await customEntrypointFactory.deploy(_factory)) as any as IAlgebraCustomPoolEntryPoint;

  const role = await (_factory as any).CUSTOM_POOL_DEPLOYER()
  await (_factory as any).grantRole(role, await _customEntrypoint.getAddress())
  

  return {
    signers,
    factory: _factory,
    customEntrypoint: _customEntrypoint,
    token0,
    token1
  };
};