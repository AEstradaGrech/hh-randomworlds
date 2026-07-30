// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;
import "./ImmutableCharacters.sol";

contract RandomCharactersFactory  {
    
    constructor(){ owner = msg.sender; }
    
    struct CollectionInfo {
        address contractAddress;
        string name;
        string symbol;
        uint256 weiMintPrice;
    }
    
    address public owner;
    CollectionInfo[] private _catalogue;
    
    function getCatalogue() external view returns(CollectionInfo[] memory){
        return _catalogue;
    }

    function deployCollection(string memory tokenName, string memory tokenSymbol, uint256 mintPrice, uint256 maxMints) 
        external {
        require(msg.sender ==owner);
        address collection = address(new ImmutableCharacters(msg.sender, tokenName, tokenSymbol, mintPrice, maxMints));
        _catalogue.push(CollectionInfo({
            contractAddress: collection,
            name: tokenName,
            symbol: tokenSymbol,
            weiMintPrice: mintPrice
        }));
    }
}