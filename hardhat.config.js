require("@nomicfoundation/hardhat-toolbox");
const { vars } = require("hardhat/config");
const INFURA_ENDPOINT = vars.get("INFURA_ENDPOINT");
const MM_KEY = vars.get("MM_KEY");
const MM_PNEMONIC = vars.get("MM_PNEMONIC");
const PINATA_JWT = vars.get("PINATA_JWT");
const PINATA_GW = vars.get("PINATA_GW");
/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.34",
    settings: {
      optimizer: {
        enabled: true,
        runs: 1000,
      },
      evmVersion: 'cancun'
    },
    allowUnlimitedContractSize: true,
  },
  networks: {
    sepolia: {
      url: INFURA_ENDPOINT,
      accounts: [MM_KEY],
    },
    hardhat: {
      accounts: {
        mnemonic: MM_PNEMONIC
      },
      chainId: 1337,
    }
  },
};

task("show-keys", "Shows the MetaMask and Infura")
  .setAction(async () => {
    console.log(`MetaMask key: ${MM_KEY}`);
    console.log(`MetaMask pnemonic: ${MM_PNEMONIC}`);
    console.log(`Infura endpoint: ${INFURA_ENDPOINT}`);
    console.log(`Pinata JWT: ${PINATA_JWT}`);
    console.log(`Pinata GW: ${PINATA_GW}`);
})
//npx hardhat balance --account 0xee6870759cbDdFb12EE3A4547C35FFB667717df4 --network sepolia
task("balance", "Prints an account's balance")
  .addParam("account", "The account's address")
  .setAction(async (taskArgs) => {
    console.log(taskArgs);
    const balance = await hre.ethers.provider.getBalance(taskArgs.account);
    console.log(hre.ethers.formatEther(balance), "ETH");
});

task('output-solc', 'Outputs the ABI and bytecode of a given contract and tags the file with a version')
  .addParam('deploymentname')
  .addParam('contractversion')
  .setAction(async (taskArgs) => {
    summary = {
      contract: taskArgs['deploymentname'],
      version: taskArgs['contractversion']
    };
    console.log(`deployment: ${summary.contract}`);
    console.log(`version: ${summary.version}`);
    try{
      const contract = await hre.ethers.getContractFactory(summary.contract);
      const artifact = await hre.artifacts.readArtifact(summary.contract);
      summary = {
        ...summary,
        abi: artifact.abi,
        bytecode: contract.bytecode
      }
      fs.outputJSONSync(path.resolve(__dirname,'deployments/solc', `${summary.contract}-v${summary.version}.json`), summary);
    }catch(e){
      console.log('-- an error has occured while compiling the contract --', e);
    }
})