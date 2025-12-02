// RevenueCat Client Service
// Browser-compatible version for EJS templates

(function() {
    'use strict';

    // Create RevenueCatService immediately (will be initialized when Purchases is available)
    window.RevenueCatService = {
        purchases: null,
        isInitialized: false,
        currentUserId: null,

        /**
         * Initialize RevenueCat SDK
         * Updated to match RevenueCat dashboard example
         */
        async initialize(userId, email = null) {
            try {
                const API_KEY = 'test_MNtPqiNNwjFdUJyGmziseOBwCtm';
                
                // Use your actual user ID (not anonymous) since users are authenticated
                const appUserId = userId.toString();
                
                // Configure RevenueCat - note: configure is synchronous, not async
                this.purchases = Purchases.configure({
                    apiKey: API_KEY,
                    appUserId: appUserId  // Note: camelCase 'appUserId', not 'appUserID'
                });

                // Set user email if provided
                if (email) {
                    await this.purchases.setEmail(email);
                }

                this.currentUserId = appUserId;
                this.isInitialized = true;

                console.log('RevenueCat initialized successfully');
                return true;
            } catch (error) {
                console.error('RevenueCat initialization error:', error);
                throw error;
            }
        },

        /**
         * Get customer info
         */
        async getCustomerInfo() {
            if (!this.isInitialized || !this.purchases) {
                throw new Error('RevenueCat not initialized');
            }

            try {
                return await this.purchases.getCustomerInfo();
            } catch (error) {
                console.error('Error fetching customer info:', error);
                throw error;
            }
        },

        /**
         * Check if user has ISKED Pro entitlement
         */
        async hasProEntitlement() {
            try {
                const customerInfo = await this.getCustomerInfo();
                const entitlement = customerInfo.entitlements.active['ISKED Pro'];
                return entitlement !== undefined;
            } catch (error) {
                console.error('Error checking entitlement:', error);
                return false;
            }
        },

        /**
         * Get available offerings
         */
        async getOfferings() {
            if (!this.isInitialized) {
                throw new Error('RevenueCat not initialized');
            }

            try {
                return await this.purchases.getOfferings();
            } catch (error) {
                console.error('Error fetching offerings:', error);
                throw error;
            }
        },

        /**
         * Purchase a package
         */
        async purchasePackage(packageToPurchase) {
            if (!this.isInitialized) {
                throw new Error('RevenueCat not initialized');
            }

            try {
                const { customerInfo } = await this.purchases.purchasePackage(packageToPurchase);
                return customerInfo;
            } catch (error) {
                console.error('Purchase error:', error);
                
                if (error.userCancelled) {
                    throw new Error('Purchase was cancelled');
                } else if (error.purchaseInvalid) {
                    throw new Error('Purchase is invalid');
                } else if (error.paymentPending) {
                    throw new Error('Payment is pending');
                } else {
                    throw new Error(error.message || 'Purchase failed');
                }
            }
        },

        /**
         * Restore purchases
         */
        async restorePurchases() {
            if (!this.isInitialized) {
                throw new Error('RevenueCat not initialized');
            }

            try {
                return await this.purchases.restorePurchases();
            } catch (error) {
                console.error('Restore purchases error:', error);
                throw error;
            }
        },

        /**
         * Get subscription status
         */
        async getSubscriptionStatus() {
            try {
                if (!this.isInitialized || !this.purchases) {
                    throw new Error('RevenueCat not initialized');
                }
                const customerInfo = await this.getCustomerInfo();
                const proEntitlement = customerInfo.entitlements.active['ISKED Pro'];
                
                if (!proEntitlement) {
                    return {
                        isActive: false,
                        willRenew: false,
                        periodType: null,
                        expirationDate: null,
                        productIdentifier: null
                    };
                }

                return {
                    isActive: true,
                    willRenew: proEntitlement.willRenew || false,
                    periodType: proEntitlement.periodType,
                    expirationDate: proEntitlement.expirationDate,
                    productIdentifier: proEntitlement.productIdentifier,
                    purchaseDate: proEntitlement.latestPurchaseDate
                };
            } catch (error) {
                console.error('Error getting subscription status:', error);
                return {
                    isActive: false,
                    willRenew: false,
                    periodType: null,
                    expirationDate: null,
                    productIdentifier: null
                };
            }
        }
    };
})();

