// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

// Custom RandomWorlds charaters
contract ImmutableCharacters is ERC721URIStorage
{
    constructor(address ownerAddress, string memory tokenName, string memory symbol, uint256 mintPrice, uint256 allowedMints)
    ERC721(tokenName, symbol)
    {
        owner = ownerAddress;
        maxMints = allowedMints;
        isAvailable = true;
        weiMintPrice = mintPrice;
        _baseURIExtended = "ipfs://";
    }

    struct TokenDetails {
        address tokenContract;
        uint256 multiplier;
        uint8 decimals;
    }

    address public owner;
    string private _baseURIExtended;
    mapping(string => TokenDetails) public paymentTokens;
    string[] private _enabledTokens;
    uint256 private _tokenId;
    uint256 public weiMintPrice;
    bool public isAvailable;
    uint256 public maxMints;
    mapping(address => uint256) _purchases;

    function resetBaseURI(string memory newUri) external {
        require(msg.sender == owner, "Restricted to owner");
        require(bytes(newUri).length > 0, "New value is empty");
        _baseURIExtended = newUri;
    }
    // Overrides the default function to enable ERC721URIStorage to get the updated baseURI
    function _baseURI() internal view override returns (string memory) {
        return _baseURIExtended;
    }

    function enabledTokens() external view returns (string[] memory){
        return _enabledTokens;
    }

    function availablePurchases() external view returns (uint256){
        return _purchases[msg.sender];
    }
    
    function totalMints() external view returns (uint256) {
        return _tokenId;
    }
    
    function setMintPrice(uint256 weiPrice) external{
        require(msg.sender == owner);
        require(weiPrice > 0);
        weiMintPrice = weiPrice;
    }

    function enableERC20(string memory symbol, address tokenContract, uint256 multiplier, uint8 decimals)  external {
        require(msg.sender == owner);
        paymentTokens[symbol] = TokenDetails({
            tokenContract: tokenContract,
            multiplier: multiplier,
            decimals: decimals
        });
        _enabledTokens.push(symbol);
    }

    //1 - Purchase = mapping(address => uint256) = derechos de compra / redeem
    //2 - Con derecho de compra guardado en contrato y acumulables (++ | --) subir img & meta a IPFS (no tiene deshacer)
    //3 - Cuando termina la request de IPFS, se llama a redeem con metadataUri, y ya si se mintea oficialmente el token
    function etherPurchase() external payable{
        require(isAvailable, "Collection cannot mint more nfts");
        require(msg.value >= weiMintPrice, "Not enough balance");
        _purchases[msg.sender]++;
    }

    function customTokenPurchase(string memory paymentToken) external{
        require(isAvailable, "Collection cannot mint more nfts");
        require(keccak256(abi.encodePacked(paymentToken)) != keccak256(abi.encodePacked("ETH")), "Payment token is ETH");
        uint256 price =  _fromWei(weiMintPrice, paymentToken);
        require(paymentTokens[paymentToken].tokenContract != address(0), "Payment token contract address not found");
        require(IERC20(paymentTokens[paymentToken].tokenContract).balanceOf(msg.sender) >= price, "Not enough balance");

        IERC20(paymentTokens[paymentToken].tokenContract).transferFrom(msg.sender, payable(owner), price);
        _purchases[msg.sender]++;
    }

    function redeemNFT(string memory metadataUri) external{
        require(_purchases[msg.sender] > 0, "No purchases found for address");
        _mintNFT(msg.sender, metadataUri);
        _purchases[msg.sender]--;
    }

    function _mintNFT(address collector, string memory metadataUri) private
    {
        _tokenId++;
        _safeMint(collector, _tokenId);
        _setTokenURI(_tokenId, metadataUri);
        if(maxMints > 0 && _tokenId >= maxMints){
            isAvailable = false;
        }
    }

    function _fromWei(uint256 weiValue, string memory tokenSymbol) private view returns (uint256){
        uint256 price = weiValue * paymentTokens[tokenSymbol].multiplier;
        if(paymentTokens[tokenSymbol].decimals == 18)
            return price;
        return  price / (10**(18-paymentTokens[tokenSymbol].decimals));
    }
}