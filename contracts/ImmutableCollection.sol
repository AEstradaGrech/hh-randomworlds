// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./LockableCharacter.sol";

contract ImmutableCollection is LockableCharacter {
    constructor(address owner, string memory tokenName, string memory tokenSymbol, string memory name, string memory collectionDesc, uint256 maxmints, uint256 price, string memory logoUrl) 
    LockableCharacter(owner, tokenName, tokenSymbol) 
    {
        _setBaseURI("ipfs://");
        collectionName = name;
        collectionDescription = collectionDesc;
        maxMints = maxmints;
        isLimited = maxMints > 0;
        defaultWeiPrice = price;
        logoEndpoint = logoUrl;
    }
    struct TokenDetails {
        address tokenContract;
        uint256 multiplier;
        uint8 decimals;
    }
    struct ModelMetadata {
        string name;
        string description;
        uint256 weiPrice;
        string fileName;
        string fileExtension;
        uint256 mints;
        uint256 maxMints;
        bool available;
    }

    event Withdrawn(address indexed caller, address indexed receiver, uint256 amount);
    error TransferFailed();

    uint256 public tokenId;
    uint256 public maxMints;
    bool public isLimited;
    string public logoEndpoint;
    string[] private models;
    mapping(string => ModelMetadata) modelsMetadata;
    string public modelsFolderCID;
    string public metadataFolderCID;
    string public endpoint;
    // Base URI required to interact with IPFS
    string private _baseURIExtended;
    string public collectionDescription;
    string private collectionName;
    bool public isOutOfStock;
    uint256 public defaultWeiPrice;
    mapping(string => TokenDetails) public paymentTokens;
    string[] private _enabledTokens;

    function modelInfo(string memory fileName) external view returns(ModelMetadata memory){
        require(bytes(modelsMetadata[fileName].name).length > 0); 
        return modelsMetadata[fileName];
    }
    function getEnabledTokens() external view returns(string[] memory){
        return _enabledTokens;
    }
    
    function enableERC20(string memory symbol, address tokenContract, uint256 multiplier, uint8 decimals)  external onlyOwner {
        paymentTokens[symbol] = TokenDetails({
            tokenContract: tokenContract,
            multiplier: multiplier, //100
            decimals: decimals  //3
        });
        _enabledTokens.push(symbol);
    }

    function setIpfsData(string memory modelsCID, string memory metadataCID, string memory ipfsEndpoint) external onlyOwner{
        require(bytes(modelsCID).length > 0);
        require(bytes(metadataCID).length > 0);
        modelsFolderCID = modelsCID;
        metadataFolderCID = metadataCID;
        endpoint = ipfsEndpoint;
    }

    // Overrides the default function to enable ERC721URIStorage to get the updated baseURI
    function _baseURI() internal view override returns (string memory) {
        return _baseURIExtended;
    }
    // Sets the base URI for the collection
    function _setBaseURI(string memory baseURI) private {
        _baseURIExtended = baseURI;
    }
         
         /**
          * @dev This function allows setting a model within the contract, with associated metadata and max mints limit if it's a limited collection. 
          * It also adds this new model to the models array.
          * Only owner can call this function.
          * Requirements: 
          * - The file name of the model should not be used before.
          * @param modelName String representing the name of the model.
          * @param fileName String representing the file name of the model.
          * @param fileExtension String representing the file extension of the model.
          * @param modelDesc String representing the description of the model.
          * @param maxmints The maximum number of mints for this model if it's a limited collection, 0 otherwise.
          */
    //TODO: defaultPrice en ETH. Conversiones a KAKA | CRAP off-chain?
    function setModel(string memory modelName, string memory fileName, string memory fileExtension, string memory modelDesc, uint256 maxmints, uint256 weiPrice) external {
        require(bytes(modelsMetadata[fileName].name).length == 0);
        if(weiPrice == 0){
            weiPrice = defaultWeiPrice;
        } 
        ModelMetadata memory data = ModelMetadata({
            name: modelName,
            description: modelDesc,
            weiPrice: weiPrice,
            fileName: fileName,
            fileExtension: fileExtension,
            mints:0,
            maxMints: 0,
            available: true
        });
        if(isLimited){ 
            data.maxMints = maxmints;
        }
        modelsMetadata[fileName] = data;
        models.push(fileName);
        
    }

    function etherMint(address collector, string memory model) external payable{
        require(msg.value >= modelsMetadata[model].weiPrice);
        _mintNFT(collector, model);
    }

    function customTokenMint(address collector, string memory model, string memory paymentToken) external{
        uint256 price =  _fromWei(modelsMetadata[model].weiPrice, paymentToken);
        if(defaultWeiPrice > 0){
            require(keccak256(abi.encodePacked(paymentToken)) != keccak256(abi.encodePacked("ETH")));
            require(paymentTokens[paymentToken].tokenContract != address(0));
            require(IERC20(paymentTokens[paymentToken].tokenContract).balanceOf(msg.sender) >= price); //conversion a paymentToke AKI

            //https://stackoverflow.com/questions/74591265/allowance-is-returned-zero-even-after-approval
            //In order to get approval from the user, they need to send a separate transaction executing the approve() function 
            //directly on the usdcAddress contract - not through any other contract
            // esto tambien vale como 'receiver' ----------------------> payable(_owner)
           IERC20(paymentTokens[paymentToken].tokenContract).transferFrom(msg.sender, payable(owner()), price);
        }
        _mintNFT(collector, model);
    }

    function withdraw(address to) external onlyOwner {
        uint256 amount = address(this).balance; 
        (bool ok, ) = to.call{value: amount}("");
        if(!ok) revert TransferFailed();
        emit Withdrawn(msg.sender, to, amount);
    }

    function _fromWei(uint256 weiValue, string memory tokenSymbol) private view returns (uint256){
        uint256 price = weiValue * paymentTokens[tokenSymbol].multiplier;
        if(paymentTokens[tokenSymbol].decimals == 18)
            return price;
        return  price / (10**(18-paymentTokens[tokenSymbol].decimals));
    }

    // Allows minting of a new NFT 
    function _mintNFT(address collector, string memory model) private{
        require(models.length > 0);
        require(bytes(modelsFolderCID).length > 0);
        require(bytes(metadataFolderCID).length > 0);
        require(bytes(endpoint).length > 0);
        require(bytes(modelsMetadata[model].name).length > 0);
        if(isLimited){
            require(tokenId < maxMints);
            require(modelsMetadata[model].mints < modelsMetadata[model].maxMints);
        }   
        string memory metadataUri = metadataFolderCID; 
        metadataUri = string.concat(metadataUri, "/");
        metadataUri = string.concat(metadataUri, modelsMetadata[model].fileName);
        metadataUri = string.concat(metadataUri, ".json");
        // NFT IDs start at 1
        tokenId++;
        _safeMint(collector, tokenId);
        _setTokenURI(tokenId, metadataUri);
        modelsMetadata[model].mints++;
        if(isLimited){
            if(modelsMetadata[model].mints >= modelsMetadata[model].maxMints){
                modelsMetadata[model].available = false;
            }
            if(tokenId >= maxMints){
                isOutOfStock = true;
            }
        }  
    }
}