# hh-randomworlds
Hardhat project to handle IPFS data &amp; deploy smart contracts for RandomWorlds

# tasks:

npx hardhat upload-randomworlds-collection --contracttype ImmutableCollection --deploymentname RandomWorlds-Season_1 --metaoverride false

npx hardhat --network localhost deploy-immutable-set --deploymentoptname RandomWorlds --contractversion 0.1.0

npx hardhat --network localhost factory-deploy-rw-collection --contracttype ImmutableCollection --deploymentversion 0.0.1 --factorydeployment ImmutableContracts-RandomWorlds-v0.0.1 --deploymentname RandomWorlds-Season_1 --tokenname RandomWorldsHardHat --tokensymbol RNDS1

npx hardhat --network localhost mint-rw-character --deploymentname RandomWorlds-Season1 --deploymentversion 0.0.1 --modelname Abigail_Williams --paymenttoken ETH --recieveraddress 0xee6870759cbDdFb12EE3A4547C35FFB667717df4

---- si deploy rw-collection casca, se pueden configurar algunos pasos con tareas propias ----
npx hardhat --network sepolia set-deployment-models --deploymentname RandomWorlds-Season1 --deploymentversion 0.0.1

npx hardhat --network sepolia set-deployment-ipfs-data --deploymentname RandomWorlds-Season1 --deploymentversion 0.0.1

npx hardhat --network sepolia enable-deployment-token --deploymentname RandomWorlds-Season1 --deploymentversion 0.0.1 --tokenname KAKA --tokenaddress 0x7cb5238CfeFCe6a95A6542410Ac0BBcfc6BEB22B --multiplier 100 --tokendecimals 3

npx hardhat --network sepolia enable-deployment-token --deploymentname RandomWorlds-Season1 --deploymentversion 0.0.1 --tokenname CRAP --tokenaddress 0xEC39263F60cb5AEfC8E4E4f36Fd9A7F50C1bD948 --multiplier 1000 --tokendecimals 18


---------- custom chars --------------
npx hardhat deploy-custom-chars-set --network localhost --tokenname ImmutableRandomCharacters --symbol RCHARS_T --weiprice 1000000000000000 --maxmints 0 --contractversion 0.0.1

npx hardhat deploy-factory-chars-contract --network localhost --tokenname ImmutableRandomCharacters --symbol RCHARS_T --weiprice 1000000000000000 --maxmints 0 
--contractversion 0.0.1

-------------------- game sessions --------------
npx hardhat deploy-game-session --network localhost --deploymentname ImmutableRandomQuests --entryfee 1000000000000000 --winmultiplier 1 --recoverycooldown 1 --sessiontimeout 1 --contractversion 0.0.1

----------------------- local setup -----------------

npx hardhat deploy-soft-token --network localhost --tokenname Words --symbol WORDS_T --deploymentversion 0.0.1

>>>>>>
npx hardhat --network localhost deploy-immutable-set --deploymentoptname RandomWorlds --contractversion 0.1.0

npx hardhat --network localhost factory-deploy-rw-collection --contracttype ImmutableCollection --deploymentversion 0.1.0 --factorydeployment ImmutableContracts-RandomWorlds-v0.1.0 --deploymentname RandomWorlds-Season_1 --tokenname RandomWorldsHardHat --tokensymbol RNDS1

npx hardhat --network localhost set-deployment-models --deploymentname RandomWorlds-Season_1 --deploymentversion 0.1.0

npx hardhat --network localhost mint-rw-character --deploymentname RandomWorlds-Season_1 --deploymentversion 0.1.0 --modelname Abigail_Williams --paymenttoken ETH --recieveraddress 0xee6870759cbDdFb12EE3A4547C35FFB667717df4

>>>>>>>
npx hardhat deploy-custom-chars-set --network localhost --tokenname ImmutableRandomCharacters --symbol RCHARS_T --weiprice 1000000000000000 --maxmints 0 --contractversion 0.1.0

npx hardhat deploy-factory-chars-contract --network localhost --tokenname ImmutableRandomCharacters --symbol RCHARS_T --weiprice 1000000000000000 --maxmints 0 --contractversion 0.1.0
>>>>>
npx hardhat deploy-game-session --network localhost --deploymentname ImmutableRandomQuests --entryfee 1000000000000000 --winmultiplier 1 --recoverycooldown 1 --sessiontimeout 1 --contractversion 0.1.0