const path = require('path')
const fs = require('fs-extra');
// npx hardhat deploy-soft-token --network localhost --tokenname Words --symbol WORDS_T --deploymentversion 0.0.1
task('deploy-soft-token', "Deploys an uncapped Soft / In-Game token with no market value to be used as reward or game mechanics")
.addParam('tokenname')
.addParam('symbol')
.addParam('deploymentversion')
.setAction(async (taskArgs, args) =>{
    summary = {
        type: "soft",
        network: args.network.name,
        name: taskArgs['tokenname'],
        symbol: taskArgs['symbol'],
        version: taskArgs['deploymentversion']
    }
    console.log('deploying softoken', summary);

    const signers = await hre.ethers.getSigners();

    let signerAddress = signers[0].address;

    console.log(`-- owner: ${signerAddress} --`);

    summary = {
        ...summary,
        owner: signerAddress
    }

    const tokenContract = await hre.ethers.getContractFactory("SoftToken");

    const deployment = await tokenContract.deploy(summary.owner, summary.name, summary.symbol);

    await deployment.waitForDeployment();
    
    let address = await deployment.getAddress();

    summary = {
        ...summary,
        address: address
    }
    console.log('deployed softoken', summary);

    const deploymentsRoot = path.join(__dirname, '..');
    fs.outputJSONSync(path.resolve(deploymentsRoot,'tokens', `${summary.symbol}-v${summary.version}-${summary.network}.json`), summary);
});