// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import {LockableCharacter} from "./LockableCharacter.sol";

/// @notice Predefined collections. Mints are bought per registered "model",
///         in ETH (revenue) or WORDS (burned sink).
contract ImmutableCollection is LockableCharacter {
    struct ModelMetadata {
        string name; string description; uint256 weiPrice;
        string fileName; string fileExtension;
        uint256 mints; uint256 maxMints; bool available;
    }

    uint256 public tokenId;
    uint256 public maxMints;
    bool    public isLimited;
    bool    public isOutOfStock;
    uint256 public defaultWeiPrice;
    string  public logoEndpoint;
    string  public collectionName;
    string  public collectionDescription;
    string  public modelsFolderCID;
    string  public metadataFolderCID;
    string  public endpoint;

    string[] private _models;
    mapping(string => ModelMetadata) private modelsMetadata;

    error ModelExists(); error UnknownModel(); error NotConfigured();
    error WrongEtherAmount(); error SoldOut();

    constructor(address owner_, string memory tokenName, string memory tokenSymbol,
                string memory name_, string memory desc_,
                uint256 maxmints, uint256 price, string memory logoUrl)
        LockableCharacter(owner_, tokenName, tokenSymbol)
    {
        collectionName = name_; collectionDescription = desc_;
        maxMints = maxmints; isLimited = maxmints > 0;
        defaultWeiPrice = price; logoEndpoint = logoUrl;
    }

    function setIpfsData(string calldata modelsCID, string calldata metadataCID, string calldata ipfsEndpoint)
        external onlyOwner
    {
        if (bytes(modelsCID).length == 0 || bytes(metadataCID).length == 0) revert NotConfigured();
        modelsFolderCID = modelsCID; metadataFolderCID = metadataCID; endpoint = ipfsEndpoint;
    }

    function setModel(string calldata modelName, string calldata fileName, string calldata fileExtension,
                      string calldata modelDesc, uint256 maxmints, uint256 weiPrice) external onlyOwner {
        if (bytes(modelsMetadata[fileName].name).length != 0) revert ModelExists();
        if (weiPrice == 0) weiPrice = defaultWeiPrice;
        modelsMetadata[fileName] = ModelMetadata({
            name: modelName, description: modelDesc, weiPrice: weiPrice,
            fileName: fileName, fileExtension: fileExtension,
            mints: 0, maxMints: isLimited ? maxmints : 0, available: true
        });
        _models.push(fileName);
    }

    function etherMint(address collector, string calldata model) external payable {
        if (msg.value < modelsMetadata[model].weiPrice) revert WrongEtherAmount();
        _mintNFT(collector, model);
    }

    /// @notice Mint paid in WORDS (burned); (deadline,v,r,s) is the ERC-2612 permit.
    function wordsMint(address collector, string calldata model,
                       uint256 deadline, uint8 v, bytes32 r, bytes32 s) external {
        _collectWords(msg.sender, wordsPrice(modelsMetadata[model].weiPrice), deadline, v, r, s);
        _mintNFT(collector, model);
    }

    function models() external view returns (string[] memory) { return _models; }
    function modelInfo(string calldata fileName) external view returns (ModelMetadata memory) {
        if (bytes(modelsMetadata[fileName].name).length == 0) revert UnknownModel();
        return modelsMetadata[fileName];
    }

    function _mintNFT(address collector, string memory model) private {
        ModelMetadata storage m = modelsMetadata[model];
        if (bytes(m.name).length == 0) revert UnknownModel();
        if (bytes(modelsFolderCID).length == 0 || bytes(metadataFolderCID).length == 0
            || bytes(endpoint).length == 0) revert NotConfigured();
        if (isLimited && (tokenId >= maxMints || m.mints >= m.maxMints)) revert SoldOut();

        tokenId++;
        _safeMint(collector, tokenId);
        _setTokenURI(tokenId, string.concat(metadataFolderCID, "/", m.fileName, ".json"));
        m.mints++;
        if (isLimited) {
            if (m.mints >= m.maxMints) m.available = false;
            if (tokenId >= maxMints) isOutOfStock = true;
        }
    }
}