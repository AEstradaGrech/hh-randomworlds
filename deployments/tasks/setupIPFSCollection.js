const PINATA_JWT = vars.get("PINATA_JWT");
const IPFS_GW = vars.get("IPFS_GW");
const fs = require('fs-extra');
const deffs = require('fs')
const fsPromises = deffs.promises;
const path = require('path')
const axios = require('axios');
const CryptoJS = require("crypto-js");

//npx hardhat upload-randomworlds-collection --contracttype ImmutableCollection --deploymentname RandomWorlds-Season_1 --metaoverride false
task('upload-randomworlds-collection', 'Uploads the RandomWorlds collection models and metadata to IPFS via Pinata and saves the returned CIDs in the deployment summary file')
.addParam('contracttype')
.addParam('deploymentname')
.addParam('metaoverride')
.setAction(async (taskArgs, args) => {
  let isMetaOverride = taskArgs["metaoverride"] === 'true' ? true : false;
  console.log('-- is meta override --', isMetaOverride);
  let summary = {
    contractType : taskArgs['contracttype'],
    deployment: taskArgs['deploymentname'],
  }
  console.log(`Importing images for the collection: ${summary.deployment}...`);
  const split = summary.deployment.split('-')
  if(split.length < 2){
    console.log('deploymentname param does not follow the required format (RandomWorlds-<<data/foldername>>');
    return;
  }
  let dataDirectoryName = split[1];
  let formattedName = `${split[0]} - ${split[1].replace('_', ' ')}`;
  const deploymentsRoot = path.join(__dirname, '..')
  const colDirPath = path.join(deploymentsRoot, 'data', dataDirectoryName);
  console.log('imgs path', colDirPath);
  const collectionData  = require(path.join(colDirPath,`collection_data.json`));
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
  summary = {
    ...summary,
    collectionName: formattedName,
    collectionDescription: colMetadata.description
  }
  
  const files = await fsPromises.readdir(path.join(colDirPath, 'models'), (err) => {if (err) console.log("Import from directory failed: ", err);});
  console.log('file names' ,files)
  const url = `https://api.pinata.cloud/pinning/pinFileToIPFS`;
  //try {
  let data = new FormData();
  let collectionModels = []
  let failedUploads = [];
  let imageNames = files.filter(x => x.includes('.png') || x.includes('.jpg'));
  for(let i = 0; i < imageNames.length; i++){
    if(collectionData.filter(x => x.imgName === imageNames[i])[0]){
        let stream = fs.createReadStream(path.join(colDirPath,'models',`${imageNames[i]}`))
        let result = await streamToBuffer(stream);
        let fileNameSplit = imageNames[i].split('.');
        data.append(`file`, new Blob([result], { type: `image/${fileNameSplit[1]}` }),`${summary.deployment}/${imageNames[i]}`);
        collectionModels.push(imageNames[i]);
        console.log(`appending image for model: ${imageNames[i]}`);
    }
    else failedUploads.push(imageNames[i]);
  }
  
  console.log('Uploading RW model images...');

  const response = await axios({
    method: 'post',
    url: url,
    headers: {
        "Authorization": `Bearer ${PINATA_JWT}`
    },
    data: data
  })

  console.log('model RW images upload response: ',response.data);

  summary = {
    ...summary,
    modelsData: {
        folderCid: response.data.IpfsHash,
        filesNumber: response.data.NumberOfFiles,
        timestamp: response.data.Timestamp,
        isOriginalCopy: response.data.IsDuplicate == false,
        mimeType: response.data.MimeType,
        models: collectionModels,
        failedUploads: failedUploads
    }
  }
  console.log('summary after model upload: ', summary);
  let isDuplicate = response.data.isDuplicate;
  console.log('is dup', isDuplicate);
  if(isDuplicate === true)
    console.log('is dup bool');
  if(isMetaOverride === true)
    console.log('is  override');
  let skipMetaUpload = false;
  if(isDuplicate === true && isMetaOverride === false){
    let ipfsDeploymentData = require(path.join(deploymentsRoot, 'ipfs', `${summary.deployment}-${summary.contractType}.json`));
    if(ipfsDeploymentData){
      console.log('-- REUSING DEPLOYED COLLECTION METADATA -- ', ipfsDeploymentData.modelsMetadata.folderCid);
      summary = {
        ...summary,
        modelsMetadata: {...ipfsDeploymentData.modelsMetadata}
      }
      console.log('reused summary', summary);
      skipMetaUpload = true;
      console.log(`-- USING META CID: ${summary.modelsMetadata.folderCid} --`);
    }
  }
  if(!skipMetaUpload && summary.modelsData.folderCid !== undefined){
    console.log('beginning metadata upload process')
    let data = new FormData();
    let metaData = [];
    collectionData.forEach(file => {
      if(file.imgName && !failedUploads.includes(file.imgName)){ //check that the file was uploaded successfully and that it has an image name
        console.log(`-- reading char profile for: ${file.name} --`)
        if(!file.imgName.includes('_logo')){
          let charProfile = charactersData.find(x => x.name === file.name);
          if(charProfile ){
              let metadata = populateCharNFTMetadata(file.name, charProfile.comment, summary.modelsData.folderCid, file.imgName, file.rarity, charProfile);
              let jsonData = JSON.stringify(metadata);
              let fileNameSplit = file.imgName.split('.');
              data.append(`file`, new Blob([jsonData], { type: 'text/plain'}),`${summary.deployment}-metadata/${fileNameSplit[0]}.json`);
              metaData.push(metadata);
              console.log(`appending ${file.imgName} metadata`)
          }
          else console.log(`-- failed to load Character NFT for imageName: ${file.imgName} --`)        
        }
      }
    })

    console.log('Uploading models metadata...')
    console.log(data)
    const metaDataResponse = await axios({
        method: 'post',
        url: url,
        headers: {
            "Authorization": `Bearer ${PINATA_JWT}`
        },
        data: data
    })

    console.log('Metadata upload response: ',metaDataResponse.data);

    summary = {
      ...summary,
      modelsMetadata: {
          folderCid: metaDataResponse.data.IpfsHash,
          metadata: metaData
      }
    }
  }
  fs.outputJSONSync(path.join(deploymentsRoot, 'ipfs', `${summary.deployment}-${summary.contractType}.json`), summary);
})

async function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
      const data = [];

      stream.on('data', (chunk) => {
        data.push(chunk);
      });

      stream.on('end', () => {
        resolve(Buffer.concat(data))
      })

      stream.on('error', (err) => {
        reject(err)
      })
   
    })
}
// ------https://dev.to/beresiartejuan/cifrado-y-descifrado-con-cryptojs-3h5g
// - También podemos especificar un vector de inicialización (IV) para mejorar la seguridad del cifrado. 
// El IV es un valor aleatorio que se utiliza en el cifrado para evitar patrones en los mensajes cifrados.
// ------https://www.c-sharpcorner.com/article/encryption-and-decryption-using-aes-symmetric-in-angular/
// - Initialization Vector (IV): Provides uniqueness to the encryption process, 
// making the same plaintext result in different ciphertexts if encrypted multiple times with the same key.
// Encryption: Generate the IV once. Convert it to Hex and append it to the end of the encrypted string.
// Decryption: Take the last 32 characters (16 bytes * 2) as the IV, convert that Hex string back to a WordArray, and pass it to the decryption function. Do not generate a new random IV.
function cryptoJsEncrypt(value) {
  /*
    AES expects:
    16 bytes (AES-128)
    24 bytes (AES-192)
    32 bytes (AES-256)
    
    When you pass a wrong-sized key CryptoJS silently “fixes” it internally

    But here’s the catch:
    encryption and decryption may DERIVE DIFFERENT internal keys
    result = empty plaintext (sigBytes: 0)
  */
  const key = CryptoJS.SHA256('secret-dev'); // 32 bytes
  
  const iv = CryptoJS.lib.WordArray.random(16);

  const encrypted = CryptoJS.AES.encrypt(value, key, {
    iv: iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });

  // prepend IV to ciphertext to be extracted and used in decryption
  /*
    'return iv.toString() + encrypted.toString()';
    Is NOT safe:
      - iv.toString() → hex string
      - encrypted.toString() → Base64 string (by default in CryptoJS)
  */
  return iv.toString(CryptoJS.enc.Hex) + encrypted.ciphertext.toString(CryptoJS.enc.Hex);
 }
function cryptoJsDecrypt(text){
  const key = CryptoJS.SHA256('secret-dev'); // 32 bytes
  console.log('-- crypto js decrypt key --', key);
  //const payload = JSON.parse(text);
  let hexIV = text.slice(0, 32); // 16 bytes IV in hex
  let hexCiphertext = text.slice(32); // rest is ciphertext in hex
  const iv = CryptoJS.enc.Hex.parse(hexIV);
  const ciphertext = CryptoJS.enc.Hex.parse(hexCiphertext);

  const cipherParams = CryptoJS.lib.CipherParams.create({
    ciphertext: ciphertext
  });

  const decrypted = CryptoJS.AES.decrypt(
    cipherParams,
    key,
    {
      iv: iv,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
    }
  );
  console.log('-- crypto js decrypt --', decrypted);
  return decrypted.toString(CryptoJS.enc.Utf8);
 }

 // For numeric traits, OpenSea currently supports three different options, number (stats), 
// boost_percentage (lower left in the image above), and boost_number (similar to boost_percentage but doesn't show a percent sign). 
// Adding an optional max_value sets a ceiling for a numerical trait's possible values. 
// It defaults to the maximum that OpenSea has seen so far on the assets on your contract.
// If you set a max_value, make sure not to pass in a higher value
function getOpenSeaTrait(name, value, display = undefined, ceiling = undefined){
  // If you pass in a value that's a number and you don't set a display_type, 
  // the trait will appear in the Rankings section (top right in the image above).
  // For string traits, you don't have to worry about display_type
  if(!display){
    // Ranking + ceiling (nums) | StringProperty
    return ceiling ? {
      trait_type:name,
      value:value,
      max_value:ceiling
    } : {
      trait_type:name,
      value:value
    }
  }
  // Boost | Stats (numbers)
  return {
    display_type:display,
    trait_type:name,
    value:value,
    max_value:ceiling
  }
}

function populateCharNFTMetadata(name, description, CID, fileName, rarity, profile = undefined) {
  let encrypted_profile = '';
  let attributtes = [];
  if(profile){
    encrypted_profile = cryptoJsEncrypt(JSON.stringify(profile));
    attributtes.push(getOpenSeaTrait('Rarity', rarity, 'boost_percentage', 4))
    attributtes.push(getOpenSeaTrait('Generation', 1, 'number', 5)) //TODO: for breeding purposes (merge characters into new one merging ambiences and moods)
    //TODO: v2: Health - Recovery rate & stakeToRecover
    // GameOver | Uncertain -= staminaDecrease. staminaDecrease es fijo y depende de rarity
    // si Stam = 0 --> stake = recover. stam += staminaIncrease * T (contract function param?). staminaIncrease es fijo y depende de rarity
    // LEVEL [1-10] - DYNAMIC_TRAIT --> se guarda en contract. aumenta / reduce stamFactors hasta un maximo del doble del valor base (a lvl 10)
    // STATUS [
    //  READY  stam > 0
    //  TIRED stam = 0 & not staked
    //  RECOVERING stam < 100 & staked
    //  OVERPOWERED stam > 100 & staked] - DYNAMIC_TRAIT. se actualiza despues de partida. Como hago para que user acepte tx de Update?
    // Jugar cuesta KAKA. Si ganas te devuelvo tu KAKA al hace submit de fin de quest. Uncertain solo cuesta KAKA y GAME OVER reduce Stam * factor y cuesta KAKA
    // Empezar una quest es una Tx. Si mapping[wallet-tokenId] = 'ONGOING' no puedes jugar mas. mapping solo resetea wallet/char onSubmit
    if(profile.ambiences){
      console.log(`-- adding OpenSea type ambience traits for ${name} --\n`, profile.ambiences);
      profile.ambiences.forEach(trait => attributtes.push(getOpenSeaTrait('Ambience', trait)));
    }
    if(profile.moods){
      console.log(`-- adding OpenSea type mood traits for ${name} --\n`, profile.moods);
      profile.moods.forEach(trait => attributtes.push(getOpenSeaTrait('Mood', trait)));
    }
  }
  return {
      name,
      description,
      image: `ipfs://${CID}/${fileName}`,
      external_url: `${IPFS_GW}/${CID}/${fileName}`,
      attributtes: attributtes,
      encrypted_profile,
  };
}

