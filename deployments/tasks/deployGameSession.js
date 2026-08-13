const GAME_SIGNER_ADDRESS = vars.get('GAME_SIGNER_ADDRESS');
const fs = require('fs-extra');
const path = require('path');

const sleep = (waitTimeInMs) => new Promise(resolve => setTimeout(resolve, waitTimeInMs));
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
    // devonly (TODO EN MINS)
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

    console.log('-- funding contract --');

    const deployed = new hre.ethers.Contract(summary.contractAddress, summary.contractABI, signer);

    await deployed.fund({value: summary.entryFee * 3});

    console.log('-- await TX --');

    await sleep(6000);

    let freeBalance = await deployed.freeBalance();

    console.log(`-- FREE BALANCE: ${freeBalance} --`);
});

//npx hardhat
task('setup-characters-collection', 'Sets the game contract as locker for the given characters contract address')
.addParam('gamedeployment') //ImmutableRandomQuests-v0.0.1-{network}.json, p.ej
.addParam('collectionaddress')  //
.addParam('collectiontype') // ImmutableCollection | ImmutableCharacters
.setAction(async (taskArgs, args) => {
    let collectionAddress = taskArgs['collectionaddress'];
    const signers = await hre.ethers.getSigners();
    const signer = signers[0];
    console.log('setting characters stuff for collection', collectionAddress);
    
    const deploymentsRoot = path.join(__dirname, '..');

    const gameSessionData = require(path.resolve(deploymentsRoot, 'games', `GameSession-${taskArgs['gamedeployment']}-${args.network.name}.json`));

    let collectionType = taskArgs['collectiontype'];
    
    if(collectionType !== 'ImmutableCollection' && collectionType !== 'ImmutableCharacters'){
        console.log('-- Collection Type is wrong >> ImmutableCollection | ImmutableCharacters');
        return;
    }
    
    const gameSession = await new hre.ethers.Contract(gameSessionData.contractAddress, gameSessionData.contractABI, signer);

    const collection = await hre.ethers.getContractAt(collectionType, collectionAddress);

    const contractName = await collection.name();

    console.log(`-- retrieved collection: ${contractName}`);

    await gameSession.setCollection(collectionAddress, true);

    console.log('-- waiting for tx --');

    await sleep(6000);

    let allowedCollection = await gameSession.allowedCollections(collectionAddress);

    console.log(`-- allowed collection: ${allowedCollection} --`);

    await collection.setLocker(gameSessionData.contractAddress);

    console.log('-- waiting for tx --');
    
    await sleep(6000);

    let locker = await collection.locker();
   
    console.log(`-- collection locker: ${locker} --`);
});

//npx hardhat --network setup-words-token --gamedeployment ImmutableRandomQuests-v0.0.1 --tokenaddress 0x8FCBFeA86D2e2B648E7B6a869367d28847702cCE --rewardpoints 1000000000000000
task('setup-words-token', 'Sets the game contract stuff for the WORDS token rewarding')
.addParam('gamedeployment') //ImmutableRandomQuests-v0.0.1-{network}.json, p.ej
.addParam('tokenaddress')  //
.addParam('rewardpoints') // en WEI
.setAction(async (taskArgs, args) => {
    let tokenAddress = taskArgs['tokenaddress'];
    let wordsReward = taskArgs['rewardpoints'];
    
    const signers = await hre.ethers.getSigners();
    const signer = signers[0];
    
    console.log('setting words token', tokenAddress);
    
    const deploymentsRoot = path.join(__dirname, '..');

    const gameSessionData = require(path.resolve(deploymentsRoot, 'games', `GameSession-${taskArgs['gamedeployment']}-${args.network.name}.json`));

    const gameSession = await new hre.ethers.Contract(gameSessionData.contractAddress, gameSessionData.contractABI, signer);

    const tokenContract = await hre.ethers.getContractAt("SoftToken", tokenAddress);

    let minterRole = await tokenContract.MINTER_ROLE();

    console.log(`-- granting minter role: ${minterRole} --`);

    await tokenContract.grantRole(minterRole, gameSessionData.contractAddress);

    console.log('-- awaiting TX --');

    await sleep(6000);

    let grantedRole = await tokenContract.hasRole(minterRole, gameSessionData.contractAddress);

    console.log(`-- granted role: ${grantedRole} --`);

    await gameSession.setWordsConfig(tokenAddress, wordsReward);

    console.log('-- awaiting TX --');

    await sleep(6000);
    
    let address = await gameSession.wordsToken();

    console.log('-- stored address --', address);
});