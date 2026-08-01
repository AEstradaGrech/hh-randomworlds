  const IPFS_GW = vars.get("IPFS_GW");
  const fs = require('fs-extra');
  const deffs = require('fs');
  const fsPromises = deffs.promises;
  const path = require('path');
  
  //npx hardhat --network localhost deploy-immutable-set --deploymentoptname RandomWorlds --contractversion 0.0.1
  task('deploy-immutable-set', 'Deploys an ImmutableContracts Set locally or in sepolia, grouped by Collection name / topic, outputting the ABI for the ImmutableFactory contract and the ImmutableCollection that it instantiates')
  .addParam('deploymentoptname')
  .addParam('contractversion')
  .setAction(async (taskArgs, args) =>{
    console.log(`deployment output name: ${taskArgs['deploymentoptname']}`)
    console.log(`version: ${taskArgs['contractversion']}`)
    console.log(`network: ${args.network.name}`)
    const signers = await hre.ethers.getSigners();
    let signerAddress = signers[0].address;
    console.log(`account: ${signerAddress}`)
    const factoryContract = await hre.ethers.getContractFactory("ImmutableFactory");
    const deployment = await factoryContract.deploy();
    await deployment.waitForDeployment();
    let address = await deployment.getAddress();
    console.log(`Immutable Factory deployed to: ${address}`)
    const instance = await hre.ethers.getContractAt('ImmutableFactory', address);
    const owner = await instance.owner();
    console.log(`-- instance owner address: ${owner} --`)
    const catalogue = await instance.getCatalogue();
    console.log('catalogue', catalogue);
    const factoryArtifact = await hre.artifacts.readArtifact("ImmutableFactory");
    let factoryABI  = factoryArtifact.abi;
    const collectionArtifact = await hre.artifacts.readArtifact("ImmutableCollection");
    let collectionABI  = collectionArtifact.abi;
    collectionArtifact.bytecode
    const data = { 
      contractName: 'ImmutableContracts',
      version: taskArgs['contractversion'],
      network: args.network.name,
      contractAddress: address,
      ownerAddress: owner, 
      factoryABI: factoryABI,
      collectionABI: collectionABI
    }
    const deploymentsRoot = path.join(__dirname, '..');
    fs.outputJSONSync(path.resolve(deploymentsRoot,'collections', `${data.contractName}-${taskArgs['deploymentoptname']}-v${data.version}-${args.network.name}.json`), data);
  })

const sleep = (waitTimeInMs) => new Promise(resolve => setTimeout(resolve, waitTimeInMs));

async function handleIpfsDeploymentData(summary){
  console.log(`Handling images for the collection: ${summary.deployment}...`);
  let split = summary.deployment.split('-');
  if(split.length !== 2){
    console.log('handleIpfsDeploymentData >> deployment name format is wrong');
    return;
  }
  let formattedName = `${split[0]} - ${split[1]}`;
  const deploymentsRoot = path.join(__dirname, "..");
  let dataDirectory = split[1];
  const colDirPath = path.join(deploymentsRoot, 'data', dataDirectory);
  let collectionData  = require(path.join(colDirPath,`collection_data.json`));
  if(!collectionData){
      console.log(`no metadata file found for collection ${summary.deployment}. Cancelling deployment...`);
      return;
  }
  let charactersData  = require(path.join(colDirPath,`characters.json`));
  if(!charactersData){
    console.log(`no character profiles have been found for collection ${summary.deployment}. Cancelling deployment...`);
    return;
  }
  let colMetadata = collectionData.filter(x => x.name == summary.deployment)[0];
  if(!colMetadata){
      console.log("metadata file for collection not found. Cancelling upload process");
      return;
  }
  let ipfsDeployment = require(path.join(deploymentsRoot, 'ipfs', `${summary.deployment}-${summary.contractType}-v${summary.version}.json`));
  if(!ipfsDeployment){
    console.log('-- failed to load the IPFS deployment data file. Cancelling deployment --');
    return;
  }
  if(!ipfsDeployment.modelsData.folderCid){
    console.log('-- No models CID found in IPFS data file. Cancelling deployment --');
    return;
  }
  if(!ipfsDeployment.modelsMetadata.folderCid){
    console.log('-- No metadata CID found in IPFS data file. Cancelling deployment --');
    return;
  }
  summary = {
      ...summary,
      collectionName: formattedName,
      collectionDescription: colMetadata.description,
      isFreeCollection: colMetadata.price <= 0,
      defaultWeiPrice: colMetadata.price*(10**18),
      isLimitedCollection: colMetadata.maxMints > 0,
      maxMints: colMetadata.maxMints,
      ipfsDeployment: ipfsDeployment,
      logoImgEndpoint: `https://ipfs.io/ipfs/${ipfsDeployment.modelsData.folderCid}/${colMetadata.imgName}`
  }
  console.log(`Collection metadata loaded. DefaultWeiPrice: ${summary.defaultWeiPrice} `);
  
  // const files = await fsPromises.readdir(path.join(colDirPath, 'Models'), (err) => {if (err) console.log("Import from directory failed: ", err);});
  // console.log('file names' ,files)

  // let uploadedModels = []
  // let failedUploads = [];
  // let imageNames = files.filter(x => x.includes('.png') || x.includes('.jpg'));
  // for(let i = 0; i < imageNames.length; i++){
  //     if(collectionData.find(x => x.imgName === imageNames[i])){
  //         uploadedModels.push(imageNames[i]);
  //         console.log(`validating image and data for model: ${imageNames[i]}`);
  //     }
  //     else failedUploads.push(imageNames[i]);
  // }

  console.log('RW model IPFS images status', summary.ipfsDeployment);
  //let metadataFolder = await fsPromises.readdir(path.join(colDirPath, 'metadata'), (err) => {if (err) console.log("Import from directory failed: ", err);});
  let metadataFolder = summary.ipfsDeployment.modelsMetadata.metadata;
  console.log('beginning metadata upload process. metadata files: ', metadataFolder)
  let metaData = [];
  let mints = 0;
  collectionData.forEach(file => {
    if(!summary.ipfsDeployment.modelsData.failedUploads.includes(x => x.imgName) && !file.imgName.includes('_logo')){
      if(file.name !== summary.deployment && summary.isLimitedCollection)
        mints += file.maxMints;
      //Default price for ALL models (collection price)
      let price = file.price; 
      // if there is no default collection price and the model has a specific price, we set it as the default price for that model
      if(price <= 0.0 && colMetadata.price > 0.0)
        price = colMetadata.price;
      console.log(`-- reading char profile for: ${file.name} --`)
      let fileNameSplit = file.imgName.split('.');
      let metadata = metadataFolder.find(x => x.name === file.name);
      if(metadata){
        metaData.push({
          ...metadata,
          maxMints: file.maxMints,
          weiPrice: price*(10**18),
          fileName: fileNameSplit[0],
          extension: `.${fileNameSplit[1]}`
        });
      }else{
        console.log('no metadata found for this model. adding it to failed uploads', file.imgName);
        failedUploads.push(file.imgName);
      }     
    }    
  })
  if(summary.maxMints < mints){
      console.log(`Max Collection mints ${summary.maxMints} is less than the individual model max mints sum, new maximum is: ${mints}`);
      summary.maxMints = mints;
  }
  summary = {
      ...summary,
      nftMetadata: {
          imagesCid: summary.ipfsDeployment.modelsData.folderCid,
          metaCid: summary.ipfsDeployment.modelsMetadata.folderCid,
          metadata: metaData
      }
  }
  console.log('validating collection models metadata...', summary.nftMetadata);
  return summary;
  
}

//npx hardhat --network localhost factory-deploy-rw-collection --contracttype ImmutableCollection --deploymentversion 0.0.1 --factorydeployment ImmutableContracts-RandomWorlds-v0.0.1 --deploymentname RandomWorlds-Season1 --tokenname RandomWorldsTest --tokensymbol RNDS1
task('factory-deploy-rw-collection', 'Deploys an ImmutableCollection contract for a RandomWorlds collection')
.addParam('contracttype') //ImmutableCollection | MutableCollection
.addParam('deploymentversion')
.addParam('factorydeployment') // ImmutableFactory-RandomWorlds-v0.0.1-sepolia
.addParam('deploymentname') //split '-' --> RandomWorlds-Season1 <- col metadata en json
.addParam('tokenname')
.addParam('tokensymbol')
.setAction(async (taskArgs, args) =>{
//getFactoryDeployment
if(!IPFS_GW ){
  console.log('-- IPFS GW variable unset, invalid deployment data --');
}
  let chain = args.network.name;
  let split = taskArgs['deploymentname'].split('-');
  if(split.length !== 2){
    console.log(`-- invalid deployment name: ${taskArgs['deploymentname']} --`);
    return;
  }
  let deploymentName = split[0];
  let deploymentDataDirectory = split[1]; 
  summary = {
    contractType : taskArgs["contracttype"],
    version: taskArgs["deploymentversion"],
    deployment: taskArgs['deploymentname'],
    tokenName: taskArgs['tokenname'],
    tokenSymbol: taskArgs['tokensymbol'],
    network: chain
  };
  const deploymentsRoot = path.join(__dirname, '..');
  let factoryDeployment = require(path.resolve(deploymentsRoot, `collections/${taskArgs['factorydeployment']}-${chain}.json`));
  const { factoryABI, collectionABI, ownerAddress, contractAddress } = factoryDeployment;
  //getDeploymentInstance
  const signers = await hre.ethers.getSigners();
  // https://stackoverflow.com/questions/76137839/error-contract-runner-does-not-support-calling-operation-call-code-unsuppor
  // The problem is you are trying to use a contract instance created with a "provider". 
  // A provider only supports querying, not calling. You need to create a contract instance with a signer
  console.log('FACTORY ABI', factoryABI);
  console.log('signer[0]', signers[0]);
  console.log('deployment.ownerAddress', ownerAddress);
  let factory = new hre.ethers.Contract(factoryDeployment.contractAddress, factoryABI, signers[0]);
  //const factory = await hre.ethers.getContractAt('ImmutableFactory', contractAddress);
  console.log('factory instance OK', factoryDeployment.contractAddress);
  let owner = await factory.owner();
  console.log('owner', owner);
  summary = await handleIpfsDeploymentData(summary);
  console.log(summary);
  //deployCollection
  if(summary.ipfsDeployment.modelsData.failedUploads.length > 0){
    console.log('An error has occured while uploading the NFTs data');
    return;
  }

  console.log('deploy params: ',summary.tokenName, summary.tokenSymbol, summary.logoImgEndpoint,summary.collectionName, summary.collectionDescription, summary.maxMints, summary.defaultWeiPrice);
  await factory.deployCollection(summary.tokenName, summary.tokenSymbol, summary.logoImgEndpoint, summary.collectionName, summary.collectionDescription, summary.maxMints, summary.defaultWeiPrice);
  console.log('-- tx done --')
  console.log('-- awaiting for tx --')
  let maxSeconds = summary.network.trim() === 'localhost' ? 1 : 10;
  for(let seconds = 0; seconds< maxSeconds; seconds++){
    await sleep(1000);
    console.log(`awaited ${seconds + 1} seconds...`);
  }
  console.log('-- after sleep --');
  let deployedCollections = await factory.getCatalogue();
  console.log('deployedCatalogue', deployedCollections);
  
  let deployedAddress = deployedCollections.slice(-1)[0];
  if(!deployedAddress){
    console.log('-- ERROR :: No summary found for the deployed collection among the retrieved factory summaries');
    return;
  }
  console.log('current collection', deployedAddress);

  //getCollectionSummary() => llamar a todas las funciones por separado y devolver objeto
  let collection = new hre.ethers.Contract(deployedAddress, collectionABI, signers[0]);
  let collectionData = await getImmutableCollectionSummary(collection);
  console.log('-- DEPLOYED COL DATA --', collectionData);
  if(!collectionData){
    console.log('-- failed to retrieve the contract summary data --');
    return;
  }
  // // address of col
  // // instance of col (address, ABI, signer)
  console.log(`Deployed collection NAME / SYMBOL : ${collectionData.tokenName} / ${collectionData.symbol}`);
  if(collectionData.tokenName && collectionData.symbol){
    summary = {
      ...summary,
      factoryAddress: factoryDeployment.contractAddress,
      contractAddress: deployedAddress,
      contractOwner: signers[0].address,
      tokenName: collectionData.tokenName,
      tokenSymbol: collectionData.symbol,
      abi: collectionABI
    }

    // 02/02/2025 --> ahora resulta que esta mierda en sepolia no funciona, revierte la transaccion. Funciona cuando quiere.
    //if(summary.network !== 'localhost') return;
    modelsMeta = summary.nftMetadata.metadata;
    deploymentStatus = {
      settedModels: [],
      ipfsDataSet: false,
      enabledTokens: ['ETH']
    }
    try{
      if(modelsMeta.length > 0){ 
        console.log('-- setting IPFS data --');
        await collection.setIpfsData(summary.nftMetadata.imagesCid, summary.nftMetadata.metaCid, IPFS_GW);
        await sleep(1000);
        deploymentStatus.ipfsDataSet = true;
        let chainData = []
        for(let i = 0; i < modelsMeta.length; i++){
          let item = modelsMeta[i];
          console.log('set model params', item.name, item.fileName, item.extension, item.description, item.maxMints, item.weiPrice);
          await collection.setModel(item.name, item.fileName, item.extension, item.description, item.maxMints, item.weiPrice);
          console.log('awaiting for TX to complete...');
          await sleep(1000);
          let modelData = await collection.modelInfo(item.fileName);
          if(modelData && modelData.name === item.name){
            chainData.push(modelData);
            deploymentStatus.settedModels.push(item.fileName);
          }
        }
        if(modelsMeta.length !== chainData.length){
          console.log('ERROR :: An error has occured while sending the models data to the contract.')
          return;
        }
        console.log('-- DEPLOYED METADATA --', chainData);
        //setIpfsData
        
        let contractSummary = await getImmutableCollectionSummary();
        summary = {
          ...summary,
          contractSummary,
          deploymentStatus
        }
        console.log('-- retrieving updated contract data --', contractSummary);
        // if(contractSummary.modelsCid && contractSummary.metaCid){
        //   deploymentStatus.ipfsDataSet = true;
        //   console.log(`-- model / meta CIDs: ${contractSummary.modelsCid} / ${contractSummary.metaCid}`);
        //   await collection.enableERC20("KAKA", KAKA_ADDRESS, 100, 3);
        //   console.log("-- enabling KAKA token --")
        //   await sleep(1000);
        //   let kakaInfo = await collection.paymentTokens("KAKA");
        //   if(kakaInfo.tokenContract !== KAKA_ADDRESS){
        //     console.log('-- An error has occured while enabling the KAKA token');
        //     return;
        //   }
        //   deploymentStatus.enabledTokens.push("KAKA");
        //   console.log(`-- Enabling CRAP coin -- `);
        //   await collection.enableERC20("CRAP", CRAP_ADDRESS, 1000, 18);
        //   await sleep(1000);
        //   let crapInfo = await collection.paymentTokens("CRAP");
        //   if(crapInfo.tokenContract !== CRAP_ADDRESS){
        //     console.log('-- An error has occured while enabling the CRAP token');
        //     return;
        //   }
        //   deploymentStatus.enabledTokens.push("CRAP");
        //   console.log('-- deployed contract address. happy path --', summary.contractAddress);  
        //   summary = {
        //     ...summary,
        //     deploymentStatus
        //   }
        //   fs.outputJSONSync(path.join(__dirname, 'deployments', 'collections', `${summary.contractType}-v${summary.version}-${summary.deployment}-${summary.network}-summary.json`), summary);
        //   console.log("-- Todo OK --");
        //   return;
        // }
        // else console.log('ERROR :: Invalid IPFS data stored in contract');
      }
      else console.log('ERROR :: No NFT metadata found in summary')
    }
    catch(e){
      console.log('-- an error has occured while setting the smartcontract data --', e);
      summary = {
        ...summary,
        deploymentStatus
      }
    }
  }
  else console.log('An error has occured with the deployed contract. No deployed collection data found.')

  console.log('-- deployed collection summary with metadata | token enabling problems --', summary);
  fs.outputJSONSync(path.join(deploymentsRoot, 'collections', `${summary.contractType}-v${summary.version}-${summary.deployment}-${summary.network}-summary.json`), summary);

})

task('set-deployment-models', 'Sets the collection models data for a given deployment if they are not already set')
.addParam('deploymentname') //split '-' --> RandomWorlds-Season1 <- col metadata en json
.addParam('deploymentversion')
.setAction(async (taskArgs, args) =>{
  console.log(`Setting models for deployment: ${taskArgs['deploymentname']}...`);
  let chain = args.network.name;
  let deploymentSummary = require(path.resolve(__dirname, `deployments/collections/ImmutableCollection-v${taskArgs['deploymentversion']}-${taskArgs['deploymentname']}-${chain}-summary.json`));
  const { abi, contractOwner, contractAddress, nftMetadata} = deploymentSummary;
  //getDeploymentInstance
  const signers = await hre.ethers.getSigners();
  const signer = signers.filter(x => x.address === contractOwner)[0]
  if(!signer){
    console.log('-- no signer found for deployment --')
    return;
  }
  // https://stackoverflow.com/questions/76137839/error-contract-runner-does-not-support-calling-operation-call-code-unsuppor
  // The problem is you are trying to use a contract instance created with a "provider". 
  // A provider only supports querying, not calling. You need to create a contract instance with a signer
  console.log('signer', signer);
  console.log('ownerAddress', contractOwner);
  console.log('contractAddress', contractAddress);
  let collection = new hre.ethers.Contract(contractAddress, abi, signer);
  for(let i = 0; i < nftMetadata.metadata.length; i++) {
    let item = nftMetadata.metadata[i];
    if(item.name.trim() === taskArgs['deploymentname'].trim()) continue;
    console.log('--querying item--', item);
    try{
      let modelInfo = await collection.modelInfo(item.fileName);
      console.log('-- model already set -- ',modelInfo);
      continue; 
    }catch(error){
      console.log('-- setting model --', item.name);
      await collection.setModel(item.name, item.fileName, item.extension, item.description, item.maxMints, item.weiPrice);
      await sleep(1000);
    }
  };
})
//npx hardhat --network sepolia set-deployment-ipfs-data --deploymentname RandomWorlds-Season1 --deploymentversion 0.0.1
task('set-deployment-ipfs-data', 'Set the collection IPFS relevant data.')
.addParam('deploymentname') //split '-' --> RandomWorlds-Season1 <- col metadata en json
.addParam('deploymentversion')
.setAction(async (taskArgs, args) =>{
  console.log(`Setting models for deployment: ${taskArgs['deploymentname']}...`);
  let chain = args.network.name;
  let deploymentSummary = require(path.resolve(__dirname, `deployments/collections/ImmutableCollection-v${taskArgs['deploymentversion']}-${taskArgs['deploymentname']}-${chain}-summary.json`));
  const { abi, contractOwner, contractAddress, nftMetadata } = deploymentSummary;
  //getDeploymentInstance
  const signers = await hre.ethers.getSigners();
  const signer = signers.filter(x => x.address === contractOwner)[0]
  if(!signer){
    console.log('-- no signer found for deployment --')
    return;
  }
  let collection = new hre.ethers.Contract(contractAddress, abi, signer);
  await collection.setIpfsData(nftMetadata.imagesCid, nftMetadata.metaCid, IPFS_GW);
  console.log('--waiting 10 seconds for tx--')
  await sleep(1000);
  let contractData = await collection.getContractSummary();
  console.log('cids', contractData.modelsCid, contractData.metaCid);
  if(contractData.modelsCid && contractData.metaCid){
    console.log(`-- model / meta CIDs: ${contractData.modelsCid} / ${contractData.metaCid}`);
  }
});
//npx hardhat --network sepolia enable-deployment-token --deploymentname RandomWorlds-Season1 --deploymentversion 0.0.1 --tokenname KAKA --tokenaddress 0x7cb5238CfeFCe6a95A6542410Ac0BBcfc6BEB22B --multiplier 100 --tokendecimals 3
task('enable-deployment-token', 'Enables an ERC20 payment token for the given deployment')
.addParam('deploymentname') //split '-' --> RandomWorlds-Season1 <- col metadata en json
.addParam('deploymentversion')
.addParam('tokenname')
.addParam('tokenaddress')
.addParam('multiplier')
.addParam('tokendecimals')
.setAction(async (taskArgs, args) =>{
  console.log(`Enabling ${taskArgs['tokenname']} token for deployment: ${taskArgs['deploymentname']}...`);
  let chain = args.network.name;
  let deploymentSummary = require(path.resolve(__dirname, `deployments/collections/ImmutableCollection-v${taskArgs['deploymentversion']}-${taskArgs['deploymentname']}-${chain}-summary.json`));
  const { abi, contractOwner, contractAddress} = deploymentSummary;
  //getDeploymentInstance
  const signers = await hre.ethers.getSigners();
  const signer = signers.filter(x => x.address === contractOwner)[0]
  if(!signer){
    console.log('-- no signer found for deployment --')
    return;
  }
  let collection = new hre.ethers.Contract(contractAddress, abi, signer);
  await collection.enableERC20(taskArgs['tokenname'], taskArgs['tokenaddress'], taskArgs['multiplier'], taskArgs['tokendecimals']);
  console.log("-- enabling token --")
  for(let i = 0; i < 10; i++){
    await sleep(1000);
    console.log(`-- awaited ${i + 1} seconds --`)
  }
  let enabledTokens = await collection.getEnabledTokens();
  console.log('enabled tokens', enabledTokens);
  if(!enabledTokens.includes(taskArgs['paymenttoken'])){
    console.log('-- An error has occured while enabling the token');
    return;
  }
  deploymentSummary.enabledTokens.push(taskArgs['tokenname'])
  fs.outputJSONSync(path.join(__dirname, 'deployments', 'collections', `ImmutableCollection-v${taskArgs['deploymentversion']}-${taskArgs['deploymentname']}-${chain}-summary.json`), deploymentSummary);
})

//npx hardhat --network localhost mint-rw-character --deploymentname RandomWorlds-Season1 --deploymentversion 0.0.1 --modelname Abigail_Williams --paymenttoken ETH --recieveraddress 0xee6870759cbDdFb12EE3A4547C35FFB667717df4
task('mint-rw-character', 'Mints a Character NFT for a RandomWorlds deployment using the specified token')
.addParam('deploymentname') //split '-' --> RandomWorlds-Season1 <- col metadata en json
.addParam('deploymentversion')
.addParam('modelname')
.addParam('paymenttoken')
.addParam('recieveraddress')
.setAction(async (taskArgs, args) =>{
  let chain = args.network.name;
  params = {
    deployment: taskArgs['deploymentname'],
    version: taskArgs['deploymentversion'],
    network: chain,
    model: taskArgs['modelname'],
    token: taskArgs['paymenttoken'],
    collector: taskArgs['recieveraddress'] 
  }
  console.log(`-- minting ${params.model} from ${params.deployment}-${params.version} (${params.network}) using ${params.token} for address: ${params.collector} --`);
  let deploymentSummary = require(path.resolve(__dirname, `deployments/collections/ImmutableCollection-v${taskArgs['deploymentversion']}-${taskArgs['deploymentname']}-${chain}-summary.json`));
  console.log('-- deployment summary --', deploymentSummary);
  const { abi, contractOwner, contractAddress, nftMetadata} = deploymentSummary;
  //getDeploymentInstance
  const signers = await hre.ethers.getSigners();
  const signer = signers.filter(x => x.address === contractOwner)[0];
  if(!signer){
    console.log('-- no signer found for deployment --');
    return;
  }
  let modelData = nftMetadata.metadata.filter(x => x.fileName === params.model)[0];
  if(!modelData){
    console.log(`-- No model found in deployment metadata for model_name: ${params.model}. Cancelling process --`);
    return;
  }
  let collection = new hre.ethers.Contract(contractAddress, abi, signer);
  let totalMints = await collection.totalMints();
  let nextMintId = parseInt(totalMints) + 1;
  let ownerOf = '';
  switch(params.token){
    case("ETH"):
      console.log(`-- attempting to mint a RandomWorlds model (${params.model}) for ${modelData.weiPrice} ${params.token} --`);
      console.log(`-- current mints: ${totalMints} / next: ${nextMintId} --`);
      await collection.etherMint(params.collector,params.model, {value: `${modelData.weiPrice}`});
      for(let i=0; i<10; i++){
        await sleep(1000);
        console.log(`-- awaited ${i+1} seconds for tx --`);
      }
      ownerOf = await collection.ownerOf(parseInt(nextMintId));
      console.log(`-- owner of Character #${nextMintId}: ${ownerOf}`);
      if(ownerOf !== params.collector)
        console.log(`-- ERROR :: owner of Character #${nextMintId} is not ${params.collector} --`);
    break;
    default:
      console.log('-- checking collection enabled payment tokens --');
      let collectionTokens = await collection.getEnabledTokens();
      console.log('-- enabled tokens --', collectionTokens);
      let selectedToken = collectionTokens.filter(x => x === params.token)[0];
      if(!selectedToken){
        console.log(`-- Collection at address ${contractAddress} has no ${params.token} enabled. Cancelling mint process --`);
        return;
      }
      let etherPrice = parseFloat(hre.ethers.formatUnits(modelData.weiPrice.toString(), 'ether'));
      console.log(`-- ether price: ${etherPrice} --`);
      let tokenDetails = await collection.paymentTokens(selectedToken);
      let tokenPrice = convertEther(etherPrice * parseInt(tokenDetails.multiplier), tokenDetails.decimals);
      console.log(`-- attempting to mint a RandomWorlds model (${params.model}) for ${tokenPrice} ${params.token} --`);
      console.log(`-- current mints: ${totalMints} / next: ${nextMintId} --`); 
      const tokenContract = getShitcoinContract(params.token, params.network, signer);
      if(!tokenContract){
        console.log(`-- No token contract found for ${params.token} token. Cancelling mint process --`);
        return;
      }
      //approve
      try{
        console.log(` -- approving ${tokenPrice} ${selectedToken} --`);
        await tokenContract.approve(signer.address, tokenPrice.toString());
        await sleep(3000);
        console.log('-- minting NFT --');
        await collection.customTokenMint(params.collector,params.model, selectedToken);
        for(let i=0; i<10; i++){
          await sleep(1000);
          console.log(`-- awaited ${i+1} seconds for tx --`);
        }
        ownerOf = await collection.ownerOf(parseInt(nextMintId));
        console.log(`-- owner of Character #${nextMintId}: ${ownerOf}`);
        if(ownerOf !== params.collector)
          console.log(`-- ERROR :: owner of Character #${nextMintId} is not ${params.collector} --`);
      }catch(error){
        console.log('-- an error has occured while approving / minting the NFT', error);
      }
    break;
  }
})

async function getImmutableCollectionSummary(collection){
  let tokenName = await collection.name();
  let symbol = await collection.symbol();
  let imagesCid = await collection.modelsFolderCID();
  let metadataCid = await collection.metadataFolderCID()
  let description = await collection.collectionDescription();
  let name = await collection.collectionName();
  let endpoint = await collection.endpoint();
  let logoEndpoint = await collection.logoEndpoint();
  let isLimited = await collection.isLimited();
  let maxMints = await collection.maxMints();
  let currentTokenId = await collection.tokenId();
  let isOutOfStock = await collection.isOutOfStock();
  let defaultWeiPrice = await collection.defaultWeiPrice();
  let models = await collection.models();
  return {
    tokenName: tokenName,
    symbol: symbol,
    name: name,
    description: description,
    imagesCid: imagesCid,
    metadataCid: metadataCid,
    endpoint: endpoint,
    logoEndpoint: logoEndpoint,
    isOutOfStock: isOutOfStock,
    defaultWeiPrice: defaultWeiPrice,
    models: models
  }
};