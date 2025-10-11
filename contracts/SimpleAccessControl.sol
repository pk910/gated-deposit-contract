// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import "@openzeppelin/contracts/access/IAccessControl.sol";

contract SimpleAccessControl is IAccessControl {
  bytes32 public constant DEFAULT_ADMIN_ROLE = 0xacce55000000000000000000ffffffffffffffffffffffffffffffffffffffff;
  bytes32 public constant DEPOSIT_CONTRACT_ROLE = 0xc0de00000000000000000000ffffffffffffffffffffffffffffffffffffffff;
  
  function hasRole(bytes32 role, address account) public view override returns (bool) {
    bytes12 prefix = bytes12(role);
    bytes32 key = bytes32(abi.encodePacked(prefix, account));
    
    uint256 value;
    assembly {
      value := sload(key)
    }
    return value == 1;
  }
  
  function hasAdminRole(address account) public view returns (bool) {
    return hasRole(DEFAULT_ADMIN_ROLE, account);
  }
  
  function hasDepositRole(address account) public view returns (bool) {
    return hasRole(DEPOSIT_CONTRACT_ROLE, account);
  }
  
  function grantRole(bytes32 role, address account) public override {
    require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "SimpleAccessControl: must have admin role to grant");
    
    bytes12 prefix = bytes12(role);
    bytes32 key = bytes32(abi.encodePacked(prefix, account));
    
    assembly {
      sstore(key, 1)
    }
    emit RoleGranted(role, account, msg.sender);
  }
  
  function revokeRole(bytes32 role, address account) public override {
    require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "SimpleAccessControl: must have admin role to revoke");
    
    bytes12 prefix = bytes12(role);
    bytes32 key = bytes32(abi.encodePacked(prefix, account));
    
    assembly {
      sstore(key, 0)
    }
    emit RoleRevoked(role, account, msg.sender);
  }
  
  function renounceRole(bytes32 role, address account) public override {
    require(account == msg.sender, "SimpleAccessControl: can only renounce roles for self");
    
    bytes12 prefix = bytes12(role);
    bytes32 key = bytes32(abi.encodePacked(prefix, account));
    
    assembly {
      sstore(key, 0)
    }
    emit RoleRevoked(role, account, msg.sender);
  }
  
  function getRoleAdmin(bytes32 role) public view override returns (bytes32) {
    return DEFAULT_ADMIN_ROLE;
  }
  
  function _grantRole(bytes32 role, address account) internal {
    bytes12 prefix = bytes12(role);
    bytes32 key = bytes32(abi.encodePacked(prefix, account));
    assembly {
      sstore(key, 1)
    }
    emit RoleGranted(role, account, address(0));
  }
  
  modifier onlyAdmin() {
    require(hasAdminRole(msg.sender), "SimpleAccessControl: caller does not have admin role");
    _;
  }
}
