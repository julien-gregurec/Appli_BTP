import Capacitor
import StoreKit

@objc(NativeBillingPlugin)
public class NativeBillingPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NativeBillingPlugin"
    public let jsName = "NativeBilling"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "products", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "purchase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restore", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "finish", returnType: CAPPluginReturnPromise)
    ]

    private let allowedProducts = ["fr.elsatia.tools.pro.monthly", "fr.elsatia.tools.pro.annual"]
    private func sku(_ productId: String) -> String? {
        if productId == "fr.elsatia.tools.pro.monthly" { return "tools_pro_monthly" }
        if productId == "fr.elsatia.tools.pro.annual" { return "tools_pro_annual" }
        return nil
    }
    private func purchasePayload(_ result: VerificationResult<Transaction>) -> [String: Any]? {
        guard case .verified(let transaction) = result else { return nil }
        return ["provider": "apple", "productId": transaction.productID,
                "transactionJws": result.jwsRepresentation,
                "transactionId": String(transaction.id), "pending": false]
    }

    @objc func products(_ call: CAPPluginCall) {
        let requested = (call.getArray("productIds", String.self) ?? []).filter { allowedProducts.contains($0) }
        Task {
            do {
                let products = try await Product.products(for: requested)
                call.resolve(["products": products.compactMap { product -> [String: Any]? in
                    guard let sku = sku(product.id) else { return nil }
                    return ["sku": sku, "provider": "apple", "productId": product.id,
                            "displayPrice": product.displayPrice, "currencyCode": product.priceFormatStyle.currencyCode,
                            "period": sku.hasSuffix("annual") ? "annual" : "monthly", "available": true]
                }])
            } catch { call.reject("Produits App Store indisponibles.") }
        }
    }

    @objc func purchase(_ call: CAPPluginCall) {
        guard let productId = call.getString("productId"), allowedProducts.contains(productId),
              let account = call.getString("appAccountToken"), let accountToken = UUID(uuidString: account) else {
            call.reject("Produit ou compte invalide."); return
        }
        Task {
            do {
                guard let product = try await Product.products(for: [productId]).first else { call.reject("Produit App Store indisponible."); return }
                switch try await product.purchase(options: [.appAccountToken(accountToken)]) {
                case .success(let result):
                    guard let payload = purchasePayload(result) else { call.reject("Transaction Apple non vérifiée."); return }
                    call.resolve(payload)
                case .pending: call.resolve(["provider": "apple", "productId": productId, "pending": true])
                case .userCancelled: call.reject("Achat annulé.", "USER_CANCELLED")
                @unknown default: call.reject("Réponse App Store inconnue.")
                }
            } catch { call.reject("Achat App Store impossible.") }
        }
    }

    @objc func restore(_ call: CAPPluginCall) {
        Task {
            do {
                try await AppStore.sync()
                var restored: [[String: Any]] = []
                for await result in Transaction.currentEntitlements {
                    if case .verified(let transaction) = result, allowedProducts.contains(transaction.productID), let payload = purchasePayload(result) { restored.append(payload) }
                }
                call.resolve(["purchases": restored])
            } catch { call.reject("Restauration App Store impossible.") }
        }
    }

    @objc func finish(_ call: CAPPluginCall) {
        guard let transactionId = call.getString("transactionId") else { call.reject("Transaction manquante."); return }
        Task {
            for await result in Transaction.unfinished {
                if case .verified(let transaction) = result, String(transaction.id) == transactionId { await transaction.finish(); call.resolve(); return }
            }
            call.resolve()
        }
    }
}
