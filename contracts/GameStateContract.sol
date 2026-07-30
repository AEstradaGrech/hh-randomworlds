// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.34;
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
contract GameStateContract 
{
    address private _owner;
    constructor()
    {
        _owner = msg.sender;
    }
    struct PlayerGame{
        uint256 tokenId;
        address tokenContract;
        string status;
        address playerWallet;
    }

    mapping(bytes => PlayerGame) public games;
    mapping(address => PlayerGame[]) public gamesLog;

    function initGame(uint256 tokenId, address tokenContract) external returns (bool){
        IERC721 nftContract = IERC721(tokenContract);
        require(nftContract.ownerOf(tokenId) == msg.sender , "Token not owned");
        bytes memory id = _getGameId(tokenId, tokenContract);
        require(games[id].tokenId == 0, "Token already in game");
        PlayerGame memory playerGame = PlayerGame({
            tokenId:tokenId,
            tokenContract: tokenContract,
            status: "ONGOING",
            playerWallet: msg.sender
        });

        games[id] = playerGame;
        return true;
    }

    function endGame(address player, uint256 tokenId, address tokenContract, string memory gameResult) external returns (bool){
        require(msg.sender == _owner);
        bytes memory id = _getGameId(tokenId, tokenContract);
        require(games[id].tokenId == tokenId && games[id].tokenContract == tokenContract, "Token not in game");
        require(games[id].playerWallet == player, "Token not owned");
        games[id].status = gameResult;
        gamesLog[msg.sender].push(games[id]);
        delete games[id];
        return true;
    }

    function _getGameId(uint256 tokenId, address tokenContract) private pure returns (bytes memory){
        return bytes(abi.encodePacked(string.concat(string(abi.encodePacked(tokenId)), "-", string(abi.encodePacked(tokenContract)))));
    }

    function getPlayerGame(address player, uint tokenId, address tokenContract) external view returns (PlayerGame memory){
        require(msg.sender == player || msg.sender == _owner, "Not allowed");
        bytes memory id = _getGameId(tokenId, tokenContract);
        return games[id];
    }

    function getPlayerGameLogs(address player) external view returns (PlayerGame[] memory){
        require(msg.sender == player || msg.sender == _owner, "Not allowed");
        return gamesLog[player];
    }
}