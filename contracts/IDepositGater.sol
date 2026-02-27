// SPDX-License-Identifier: MIT
pragma solidity >=0.6.8;

interface IDepositGater {
    function check_deposit(address sender, bytes calldata pubkey, bytes calldata withdrawal_credentials, bytes calldata signature, uint256 amount) external returns (bool);
}
