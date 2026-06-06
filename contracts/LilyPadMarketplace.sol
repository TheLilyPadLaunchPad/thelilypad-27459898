// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/interfaces/IERC2981.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title LilyPadMarketplace
 * @dev Escrow-based marketplace with unified 2.0% platform fee, split
 *      internally between Treasury (1.5%), Team (0.25%) and Buyback pool
 *      (0.25%). Honors ERC-2981 creator royalties on secondary sales.
 */
contract LilyPadMarketplace is ReentrancyGuard, Ownable {

    struct Listing {
        address seller;
        address nftAddress;
        uint256 tokenId;
        uint256 price;
        bool active;
    }

    uint256 public listingCount;
    mapping(uint256 => Listing) public listings;

    // Unified 2.0% platform fee, split internally
    uint256 public marketplaceFeePercent = 200;        // 2.00%
    uint256 public teamFeePercent        = 25;         // 0.25%
    uint256 public buybackFeePercent     = 25;         // 0.25%
    // treasury share = marketplaceFeePercent - teamFeePercent - buybackFeePercent
    uint256 public constant FEE_DENOMINATOR = 10000;

    address public treasuryWallet;
    address public teamWallet;
    address public buybackWallet;

    event ItemListed(uint256 indexed listingId, address indexed seller, address indexed nftAddress, uint256 tokenId, uint256 price);
    event ItemSold(uint256 indexed listingId, address indexed buyer, address indexed seller, uint256 price, uint256 royaltyPaid, uint256 platformFeePaid);
    event ListingCanceled(uint256 indexed listingId);
    event FeeWalletsUpdated(address treasury, address team, address buyback);

    constructor(address _treasury, address _team, address _buyback) Ownable(msg.sender) {
        require(_treasury != address(0) && _team != address(0) && _buyback != address(0), "Invalid wallet");
        treasuryWallet = _treasury;
        teamWallet = _team;
        buybackWallet = _buyback;
    }

    function listItem(address _nftAddress, uint256 _tokenId, uint256 _price) external nonReentrant {
        require(_price > 0, "Price must be greater than zero");

        IERC721 nft = IERC721(_nftAddress);
        require(nft.ownerOf(_tokenId) == msg.sender, "Not the owner");
        require(nft.isApprovedForAll(msg.sender, address(this)), "Marketplace not approved");

        nft.transferFrom(msg.sender, address(this), _tokenId);

        listingCount++;
        listings[listingCount] = Listing({
            seller: msg.sender,
            nftAddress: _nftAddress,
            tokenId: _tokenId,
            price: _price,
            active: true
        });

        emit ItemListed(listingCount, msg.sender, _nftAddress, _tokenId, _price);
    }

    function buyItem(uint256 _listingId) external payable nonReentrant {
        Listing storage listing = listings[_listingId];
        require(listing.active, "Listing not active");
        require(msg.value >= listing.price, "Insufficient payment");

        listing.active = false;

        // ERC-2981 royalty lookup (creator royalty enforced on secondary sale)
        uint256 royaltyAmount = 0;
        address royaltyReceiver;
        if (_supportsERC2981(listing.nftAddress)) {
            try IERC2981(listing.nftAddress).royaltyInfo(listing.tokenId, listing.price) returns (address recv, uint256 amount) {
                royaltyReceiver = recv;
                royaltyAmount = amount;
            } catch {}
        }

        // Platform fee 3-way split
        uint256 totalPlatformFee = (listing.price * marketplaceFeePercent) / FEE_DENOMINATOR;
        uint256 teamShare        = (listing.price * teamFeePercent) / FEE_DENOMINATOR;
        uint256 buybackShare     = (listing.price * buybackFeePercent) / FEE_DENOMINATOR;
        uint256 treasuryShare    = totalPlatformFee - teamShare - buybackShare;

        // Sanity: royalty + platform fee must not exceed price
        require(royaltyAmount + totalPlatformFee <= listing.price, "Fees exceed price");
        uint256 sellerProceeds = listing.price - royaltyAmount - totalPlatformFee;

        // Pay royalty (creator)
        if (royaltyAmount > 0 && royaltyReceiver != address(0)) {
            (bool okR, ) = payable(royaltyReceiver).call{value: royaltyAmount}("");
            require(okR, "Royalty transfer failed");
        }

        // Pay platform splits
        (bool okT, ) = payable(treasuryWallet).call{value: treasuryShare}("");
        require(okT, "Treasury transfer failed");
        (bool okTeam, ) = payable(teamWallet).call{value: teamShare}("");
        require(okTeam, "Team transfer failed");
        (bool okB, ) = payable(buybackWallet).call{value: buybackShare}("");
        require(okB, "Buyback transfer failed");

        // Pay seller
        (bool okS, ) = payable(listing.seller).call{value: sellerProceeds}("");
        require(okS, "Transfer to seller failed");

        // Transfer NFT to buyer
        IERC721(listing.nftAddress).transferFrom(address(this), msg.sender, listing.tokenId);

        // Refund excess payment
        if (msg.value > listing.price) {
            (bool okRef, ) = payable(msg.sender).call{value: msg.value - listing.price}("");
            require(okRef, "Refund failed");
        }

        emit ItemSold(_listingId, msg.sender, listing.seller, listing.price, royaltyAmount, totalPlatformFee);
    }

    function cancelListing(uint256 _listingId) external nonReentrant {
        Listing storage listing = listings[_listingId];
        require(listing.active, "Listing not active");
        require(listing.seller == msg.sender, "Not the seller");

        listing.active = false;
        IERC721(listing.nftAddress).transferFrom(address(this), msg.sender, listing.tokenId);

        emit ListingCanceled(_listingId);
    }

    function setMarketplaceFee(
        uint256 _platformBps,
        uint256 _teamBps,
        uint256 _buybackBps
    ) external onlyOwner {
        require(_platformBps <= 1000, "Fee too high"); // Max 10%
        require(_teamBps + _buybackBps <= _platformBps, "Splits exceed total");
        marketplaceFeePercent = _platformBps;
        teamFeePercent = _teamBps;
        buybackFeePercent = _buybackBps;
    }

    function setFeeWallets(address _treasury, address _team, address _buyback) external onlyOwner {
        require(_treasury != address(0) && _team != address(0) && _buyback != address(0), "Invalid wallet");
        treasuryWallet = _treasury;
        teamWallet = _team;
        buybackWallet = _buyback;
        emit FeeWalletsUpdated(_treasury, _team, _buyback);
    }

    function _supportsERC2981(address nft) internal view returns (bool) {
        (bool ok, bytes memory data) = nft.staticcall(
            abi.encodeWithSignature("supportsInterface(bytes4)", bytes4(0x2a55205a))
        );
        return ok && data.length >= 32 && abi.decode(data, (bool));
    }
}
