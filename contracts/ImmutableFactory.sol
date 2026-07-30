// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;
import "./ImmutableCollection.sol";

contract ImmutableFactory  {
    constructor(){ owner = msg.sender; }
    
    address public owner;
    address[] private _catalogue;
    function getCatalogue() external view returns(address[] memory){
        return _catalogue;
    }
    function deployCollection(string memory tokenName, string memory tokenSymbol, string memory logoEndpoint, string memory collectionName, string memory collectionDesc, uint256 maxMints, uint256 defaultPrice) 
        external {
        require(msg.sender ==owner);
        address collection = address(new ImmutableCollection(msg.sender, tokenName, tokenSymbol, collectionName, collectionDesc, maxMints, defaultPrice, logoEndpoint));
        _catalogue.push(collection);
    }
}