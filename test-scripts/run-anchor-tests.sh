#!/bin/bash

set -e
trap 'echo -e "\nStopped by signal $? (SIGINT)"; exit 0' INT

if [ "$1" != "--skip-build" ]; then
  anchor build -- --features anchor-test && anchor test --skip-build &&
    cp target/idl/drift.json sdk/src/idl/
fi

export ANCHOR_WALLET=~/.config/solana/id.json

test_files=(
  # cappedSymFunding.ts
  # delistMarket.ts
  # delistMarketLiq.ts
  # imbalancePerpPnl.ts
  # ksolver.ts
  # repegAndSpread.ts
  # spotWithdrawUtil100.ts
  # updateAMM.ts
  # updateK.ts
  # postOnlyAmmFulfillment.ts
  # TODO BROKEN ^^
	builderCodes.ts
  decodeUser.ts
  scaleOrders.ts
  # fuel.ts
  # fuelSweep.ts
  admin.ts
  assetTier.ts
  cancelAllOrders.ts
  curve.ts
  deleteInitializedSpotMarket.ts
  depositIntoSpotMarketVault.ts
  driftClient.ts
  # fillSpot.ts # spot DLOB disabled
  ifRebalance.ts
  adminWithdrawFromInsuranceFundVault.ts
  insuranceFundStake.ts
  isolatedPositionDriftClient.ts
  isolatedPositionLiquidatePerp.ts
  isolatedPositionLiquidatePerpwithFill.ts
  liquidateBorrowForPerpPnl.ts
  liquidatePerp.ts
  liquidatePerpWithFill.ts
  liquidatePerpPnlForDeposit.ts
  liquidateSpot.ts
  liquidateSpotSocialLoss.ts
  lpPool.ts
  lpPoolSwap.ts
  marketOrder.ts
  marketOrderBaseAssetAmount.ts
  maxDeposit.ts
  maxLeverageOrderParams.ts
  modifyOrder.ts
  multipleMakerOrders.ts
  # multipleSpotMakerOrders.ts # spot DLOB disabled
  # openbookTest.ts # spot DLOB disabled
  oracleDiffSources.ts
  oracleFillPriceGuardrails.ts
  oracleOffsetOrders.ts
  order.ts
  orderMarginChecks.ts
  isolatedTransferMarginChecks.ts
  ordersWithSpread.ts
  pauseExchange.ts
  pauseDepositWithdraw.ts
  # phoenixTest.ts # spot DLOB disabled
  placeAndMakePerp.ts
  placeAndMakeSignedMsgBankrun.ts
  # placeAndMakeSpotOrder.ts # spot DLOB disabled
  postOnly.ts
  prelisting.ts
  pyth.ts
  pythLazerBankrun.ts
  referrer.ts
  roundInFavorBaseAsset.ts
  # serumTest.ts # spot DLOB disabled
  settlePNLInvariant.ts
  spotDepositWithdraw.ts
  spotDepositWithdraw22.ts
  spotDepositWithdraw22TransferHooks.ts
  spotMarketPoolIds.ts
  spotSwap.ts
  spotSwap22.ts
  stopLimits.ts
  subaccounts.ts
  surgePricing.ts
  switchboardTxCus.ts
  switchOracle.ts
  triggerOrders.ts
  # triggerSpotOrder.ts # spot DLOB disabled
  transferPerpPosition.ts
  userAccount.ts
  userDelegate.ts
  userOrderId.ts
  perpMarketConfig.ts
  # whitelist.ts
  transferFeeAndPnlPool.ts
)


for test_file in ${test_files[@]}; do
  ts-mocha -t 300000 ./tests/${test_file} || exit 1
done
