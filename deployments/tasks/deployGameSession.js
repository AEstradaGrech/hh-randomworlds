const GAME_SIGNER_ADDRESS = vars.get('GAME_SIGNER_ADDRESS');
const fs = require('fs-extra');
const path = require('path');

//npx hardhat deploy-game-session --network localhost --deploymentname ImmutableRandomQuests --entryfee 1000000000000000 --winmultiplier 1 --recoverycooldown 1 --sessiontimeout 1 --contractversion 0.1.0
task('deploy-game-session', 'Deploys a game session contract for the Quests Mode')
.addParam('deploymentname')
.addParam('contractversion')
.addParam('entryfee')
.addParam('winmultiplier')
.addParam('recoverycooldown')
.addParam('sessiontimeout')
.setAction(async (taskArgs, args) => {
    console.log('deploying game session');
    const HOUR = 60 * 60;
    const DAY  = 24 * HOUR;

    // e.g. task takes cooldown in DAYS and timeout in HOURS
    const recoveryCooldown = BigInt(taskArgs.recoverycooldown) * BigInt(60);   // 3  -> 259200
    const sessionTimeout   = BigInt(taskArgs.sessiontimeout)   * BigInt(60);  // 1  -> 3600

    summary = {
        type: "GameSession",
        chain: args.network.name,
        deploymentName: taskArgs['deploymentname'],
        entryFee: taskArgs['entryfee'],
        winMultiplier: taskArgs['winmultiplier'],
        recoveryCooldown: `${taskArgs['recoverycooldown']} mins. (${recoveryCooldown} seconds)`,
        sessionTimeout: `${taskArgs['sessiontimeout']} mins. (${sessionTimeout} seconds)`,
        version: taskArgs['contractversion']
    }
    /*
    winMultiplierBps is in basis points, where payout = wager × bps / 10000. So:

        10000 = 100% (win refunds the full wager)
        15000 = 150%
        1 = 0.01% — effectively a zero payout
    --winmultiplier 1 almost certainly isn't what you want; use 10000 (or whatever %, ×100
    */
    const finalMultiplier = summary.winMultiplier * 10000;
    const signers = await hre.ethers.getSigners();
    const signer = signers[0];

    const contractFactory = await hre.ethers.getContractFactory("GameSession");

    const deployment = await contractFactory.deploy(signer.address, GAME_SIGNER_ADDRESS, summary.entryFee, finalMultiplier, recoveryCooldown, sessionTimeout);

    await deployment.waitForDeployment();

    const artifact = await hre.artifacts.readArtifact("GameSession");

    summary = {
        ...summary,
        contractAddress: await deployment.getAddress(),
        contractABI: artifact.abi
    }
    const deploymentsRoot = path.join(__dirname, '..');

    fs.outputJSONSync(path.resolve(deploymentsRoot,'games', `${summary.type}-${summary.deploymentName}-v${summary.version}-${summary.chain}.json`), summary);
});