// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

interface IDepositGater {
    function check_deposit(address sender, bytes calldata pubkey, bytes calldata withdrawal_credentials, bytes calldata signature, uint256 amount) external returns (bool);
}
