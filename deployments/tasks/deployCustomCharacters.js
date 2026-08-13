const fs = require('fs-extra');
const path = require('path');
const sleep = (waitTimeInMs) => new Promise(resolve => setTimeout(resolve, waitTimeInMs));

// npx hardhat deploy-custom-chars-set --network localhost --tokenname ImmutableRandomCharacters --symbol RCHARS_T --weiprice 1000000000000000 --maxmints 0 --contractversion 0.0.1
task('deploy-custom-chars-set', 'Deploy a factory and a collection of custom chars')
.addParam('tokenname')
.addParam('symbol')
.addParam('weiprice')
.addParam('maxmints')
.addParam('contractversion')
.setAction(async (taskArgs, args) => {
    console.log('deploying Custom Immutable Characters set');
    const signers = await hre.ethers.getSigners();
    
    let signer = signers[0];
    
    console.log(`-- signer: ${signer.address} --`);

    summary = {
        type: 'ImmutableCharacters',
        version: taskArgs['contractversion'],
        chain: args.network.name,
        owner: signer.address,
        tokenName: taskArgs['tokenname'],
        symbol: taskArgs['symbol'],
        weiPrice: taskArgs['weiprice'],
        maxMints: taskArgs['maxmints'],
        isLimited: false
    }
    
    summary.isLimited = summary.maxMints > 0;
    
    console.log(summary);

    const factoryContract = await hre.ethers.getContractFactory('RandomCharactersFactory');
    
    const factoryDeployment = await factoryContract.deploy();

    await factoryDeployment.waitForDeployment();

    let factoryAddress = await factoryDeployment.getAddress();

    console.log(`-- custom characters factory address: ${factoryAddress} --`);

    summary = {
        ...summary,
        factoryAddress: factoryAddress
    }
    
    const factoryArtifact = await hre.artifacts.readArtifact("RandomCharactersFactory");

    let factoryABI  = factoryArtifact.abi;

    const factory = new hre.ethers.Contract(factoryAddress, factoryABI, signer);

    let factoryCollections = await factory.getCatalogue();

    console.log('-- factory catalogue --');
    console.log(factoryCollections);
    summary = {
        ...summary,
        collectionAddress: '',
        factoryABI: factoryABI,
        totalCollections: 0
    }
    const deploymentsRoot = path.join(__dirname, '..');

    fs.outputJSONSync(path.resolve(deploymentsRoot,'collections', `ImmutableCharactersSet-v${summary.version}-${summary.chain}.json`), summary);

    if(factoryCollections.length === 0){
        console.log('-- deploying first collection as current --');

        await factory.deployCollection(summary.tokenName, summary.symbol, parseInt(summary.weiPrice), parseInt(summary.maxMints))

        if(summary.chain !== 'localhost')
            await sleep(6000);
        
        factoryCollections = await factory.getCatalogue();
    }
    
    if(factoryCollections.length > 0){
        console.log('-- checking current collection values --');
        
        let currentCollection = factoryCollections.slice(-1)[0];

        console.log(`-- collection address: ${currentCollection[0]} --`);

        const collection = await hre.ethers.getContractAt("ImmutableCharacters", currentCollection[0]);

        let deployedSymbol = await collection.symbol();

        let deployedName = await collection.name();

        let deployedPrice = await collection.weiMintPrice();

        console.log(`-- SYMBOL: ${deployedSymbol} --`);
        
        console.log(`-- NAME: ${deployedName} --`);
        
        console.log(`-- PRICE: ${deployedPrice} --`);

        const collectionArtifact = await hre.artifacts.readArtifact("ImmutableCharacters");

        summary = {
            ...summary,
            collectionAddress: currentCollection[0],
            factoryABI: factoryABI,
            collectionABI: collectionArtifact.abi,
            totalCollections: factoryCollections.length
        }
    }

    fs.outputJSONSync(path.resolve(deploymentsRoot,'collections', `ImmutableCharactersSet-v${summary.version}-${summary.chain}.json`), summary);
});

//npx hardhat --network sepolia update-custom-chars-set --deploymentversion 0.1.1
task('update-custom-chars-set', 'Updates the ImmutableCharactersSet data')
.addParam('deploymentversion')
.setAction(async (taskArgs, args) => {
    
    const signers = await hre.ethers.getSigners();
    
    const signer = signers[0];

    const deploymentsRoot = path.join(__dirname, '..');

    let summary = require(path.resolve(deploymentsRoot, 'collections', `ImmutableCharactersSet-v${taskArgs['deploymentversion']}-${args.network.name}.json`));

    console.log('-- updating ImmutableCharactersSet data --', summary);

    const factory = await new hre.ethers.Contract(summary.factoryAddress, summary.factoryABI, signer);

    let catalogue = await factory.getCatalogue();

    console.log(`-- catalogue len: ${catalogue.length} --`);

    summary.totalCollections = catalogue.length;

    if(catalogue.length > 0){
        console.log('-- checking current collection values --');
        
        let currentCollection = catalogue.slice(-1)[0];

        console.log(`-- collection address: ${currentCollection[0]} --`);

        const collection = await hre.ethers.getContractAt("ImmutableCharacters", currentCollection[0]);

        let deployedSymbol = await collection.symbol();

        let deployedName = await collection.name();

        let deployedPrice = await collection.weiMintPrice();

        console.log(`-- SYMBOL: ${deployedSymbol} --`);
        
        console.log(`-- NAME: ${deployedName} --`);
        
        console.log(`-- PRICE: ${deployedPrice} --`);

        const collectionArtifact = await hre.artifacts.readArtifact("ImmutableCharacters");

        summary = {
            ...summary,
            collectionAddress: currentCollection[0],
            collectionABI: collectionArtifact.abi
        }
    }

    fs.outputJSONSync(path.resolve(deploymentsRoot,'collections', `ImmutableCharactersSet-v${summary.version}-${summary.chain}.json`), summary);
})
// npx hardhat deploy-custom-chars-set --network localhost --tokenname ImmutableRandomCharacters --symbol RCHARS_T --weiprice 1000000000000000 --maxmints 0 --contractversion 0.0.1
task('deploy-factory-chars-contract', 'Deploy ImmutableCharacters contract using the specified factory')
.addParam('tokenname')
.addParam('symbol')
.addParam('weiprice')
.addParam('maxmints')
.addParam('contractversion')
.setAction(async (taskArgs, args) => {
    console.log('deploying Custom Immutable Characters set');
    const signers = await hre.ethers.getSigners();
    
    let signer = signers[0];
    
    console.log(`-- signer: ${signer.address} --`);

    summary = {
        type: 'ImmutableCharacters',
        version: taskArgs['contractversion'],
        chain: args.network.name,
        owner: signer.address,
        tokenName: taskArgs['tokenname'],
        symbol: taskArgs['symbol'],
        weiPrice: taskArgs['weiprice'],
        maxMints: taskArgs['maxmints'],
        isLimited: false
    }
    
    summary.isLimited = summary.maxMints > 0;
    
    console.log(summary);

    const deploymentsRoot = path.join(__dirname, '..');

    const factoryDeployment = require(path.resolve(deploymentsRoot, 'collections', `ImmutableCharactersSet-v${summary.version}-${summary.chain}.json`));

    const { factoryAddress, factoryABI, collectionABI } = factoryDeployment;

    const factory = new hre.ethers.Contract(factoryAddress, factoryABI, signer);

    await factory.deployCollection(summary.tokenName, summary.symbol, parseInt(summary.weiPrice), parseInt(summary.maxMints))

    let factoryCollections = await factory.getCatalogue();

    console.log('-- factory catalogue --');
    console.log(factoryCollections);

    let currentCollection = factoryCollections.slice(-1)[0];

    console.log(`-- collection address: ${currentCollection[0]} --`);

    const collection = new hre.ethers.Contract(currentCollection[0], collectionABI, signer);

    let deployedSymbol = await collection.symbol();

    let deployedName = await collection.name();

    let deployedPrice = await collection.weiMintPrice();

    console.log(`-- SYMBOL: ${deployedSymbol} --`);
    
    console.log(`-- NAME: ${deployedName} --`);
    
    console.log(`-- PRICE: ${deployedPrice} --`);


    summary = {
        ...summary,
        factoryAddress: factoryAddress,
        collectionAddress: currentCollection[0],
        factoryABI: factoryABI,
        collectionABI: collectionABI,
        totalCollections: factoryCollections.length
    }

    fs.outputJSONSync(path.resolve(deploymentsRoot,'collections', `ImmutableCharactersSet-v${summary.version}-${summary.chain}.json`), summary);
});