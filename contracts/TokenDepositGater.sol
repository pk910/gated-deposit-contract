// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "./IDepositGater.sol";
import "./SimpleAccessControl.sol";

contract TokenDepositGater is IDepositGater, SimpleAccessControl, ERC20 {
  bytes32 public constant DEPOSIT_CONTRACT_ROLE = 0xc0de00000000000000000000ffffffffffffffffffffffffffffffffffffffff;

  // Storage key prefix for gate settings: "gate" (0x67617465) followed by zeros, last 2 bytes = deposit prefix
  // Deposit prefixes: 0x0000 (0x00), 0x0001 (0x01), 0x0002 (0x02), 0x0003 (0x03), 0xffff (topups)
  // Value bits: 0x01 = blocked, 0x02 = noToken
  bytes30 private constant GATE_SETTINGS_PREFIX = 0x676174650000000000000000000000000000000000000000000000000000;

  // Storage key for custom gater address: "custgater" (0x6375737467617465720000...)
  bytes32 private constant CUSTOM_GATER_KEY = 0x6375737467617465720000000000000000000000000000000000000000000000;

  uint16 public constant TOPUP_DEPOSIT_TYPE = 0xffff;

  event DepositGateConfigChanged(uint16 indexed depositType, bool blocked, bool noToken);
  event CustomGaterChanged(address indexed oldGater, address indexed newGater);

  constructor() ERC20("Deposit Token", "Deposit") {
    _grantRole(DEFAULT_ADMIN_ROLE, _msgSender());
    _grantRole(DEPOSIT_CONTRACT_ROLE, address(0x00000000219ab540356cBB839Cbe05303d7705Fa));
  }

  function decimals() public view virtual override returns (uint8) {
    return 0;
  }

  function _getGateSettingsKey(uint16 depositType) private pure returns (bytes32) {
    return bytes32(abi.encodePacked(GATE_SETTINGS_PREFIX, depositType));
  }

  function getDepositGateConfig(uint16 depositType) public view returns (bool blocked, bool noToken) {
    bytes32 key = _getGateSettingsKey(depositType);
    uint256 value;
    assembly {
      value := sload(key)
    }
    blocked = (value & 0x01) != 0;
    noToken = (value & 0x02) != 0;
  }

  function setDepositGateConfig(uint16 depositType, bool blocked, bool noToken) public onlyAdmin {
    bytes32 key = _getGateSettingsKey(depositType);
    uint256 value = (blocked ? 0x01 : 0) | (noToken ? 0x02 : 0);
    assembly {
      sstore(key, value)
    }
    emit DepositGateConfigChanged(depositType, blocked, noToken);
  }

  function getCustomGater() public view returns (address gater) {
    bytes32 key = CUSTOM_GATER_KEY;
    assembly {
      gater := sload(key)
    }
  }

  function setCustomGater(address gater) public onlyAdmin {
    address oldGater = getCustomGater();
    bytes32 key = CUSTOM_GATER_KEY;
    assembly {
      sstore(key, gater)
    }
    emit CustomGaterChanged(oldGater, gater);
  }

  function isAllZero(bytes calldata data, uint256 expectedLength) internal pure returns (bool) {
    if (data.length != expectedLength) return false;
    for (uint256 i = 0; i < data.length; ++i) {
      if (data[i] != 0) return false;
    }
    return true;
  }

  function check_deposit(address sender, bytes calldata pubkey, bytes calldata withdrawal_credentials, bytes calldata signature, uint256 amount) public returns (bool) {
    require(hasRole(DEPOSIT_CONTRACT_ROLE, _msgSender()), "Only deposit contract can call this function");

    // check custom gater first if set
    address customGater = getCustomGater();
    if (customGater != address(0)) {
      if (IDepositGater(customGater).check_deposit(sender, pubkey, withdrawal_credentials, signature, amount)) {
        return true;
      }
    }

    // check if this is a top-up deposit (signature = 96 zero bytes)
    bool isTopUp = isAllZero(signature, 96) && isAllZero(withdrawal_credentials, 32);

    // determine deposit type: topup (0xffff) or withdrawal credential prefix byte
    uint16 depositType;
    if (isTopUp) {
      depositType = TOPUP_DEPOSIT_TYPE;
    } else {
      require(withdrawal_credentials.length >= 1, "Invalid withdrawal credentials");
      depositType = uint16(uint8(withdrawal_credentials[0]));
    }

    // get gate config for this deposit type
    (bool blocked, bool noToken) = getDepositGateConfig(depositType);

    // check if blocked
    require(!blocked, "Deposit type is blocked");

    // check if token is required
    if (!noToken) {
      require(balanceOf(sender) > 0, "Not enough tokens");
      _burn(sender, 1);
    }

    return true;
  }

  function mint(address to, uint256 amount) public virtual {
    require(hasRole(DEFAULT_ADMIN_ROLE, _msgSender()), "Only admin can mint");
    _mint(to, amount);
  }

}
