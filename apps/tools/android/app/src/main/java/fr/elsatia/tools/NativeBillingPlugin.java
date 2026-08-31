package fr.elsatia.tools;

import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.PendingPurchasesParams;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.PurchasesUpdatedListener;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryPurchasesParams;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@CapacitorPlugin(name = "NativeBilling")
public class NativeBillingPlugin extends Plugin implements PurchasesUpdatedListener {
    private BillingClient billingClient;
    private PluginCall purchaseCall;
    private final Map<String, ProductDetails> products = new HashMap<>();

    @Override public void load() {
        billingClient = BillingClient.newBuilder(getContext()).setListener(this)
            .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build()).build();
    }
    private void connected(Runnable action, PluginCall call) {
        if (billingClient.isReady()) { action.run(); return; }
        billingClient.startConnection(new BillingClientStateListener() {
            @Override public void onBillingSetupFinished(BillingResult result) {
                if (result.getResponseCode() == BillingClient.BillingResponseCode.OK) action.run(); else call.reject("Google Play Billing indisponible.");
            }
            @Override public void onBillingServiceDisconnected() { }
        });
    }
    private boolean allowed(String id) { return "tools_pro_monthly".equals(id) || "tools_pro_annual".equals(id); }
    private String opaqueAccount(String account) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(("elsatia-tools:" + account).getBytes(StandardCharsets.UTF_8));
            StringBuilder value = new StringBuilder(); for (byte part : digest) value.append(String.format("%02x", part)); return value.toString();
        } catch (Exception error) { throw new IllegalStateException(error); }
    }

    @PluginMethod public void products(PluginCall call) {
        JSArray ids = call.getArray("productIds", new JSArray());
        List<QueryProductDetailsParams.Product> requested = new ArrayList<>();
        try {
            for (Object value : ids.toList()) if (value instanceof String && allowed((String) value)) requested.add(
                QueryProductDetailsParams.Product.newBuilder().setProductId((String) value).setProductType(BillingClient.ProductType.SUBS).build());
        } catch (Exception error) { call.reject("Catalogue Google Play invalide."); return; }
        connected(() -> billingClient.queryProductDetailsAsync(QueryProductDetailsParams.newBuilder().setProductList(requested).build(), (result, detailsResult) -> {
            JSArray response = new JSArray();
            for (ProductDetails detail : detailsResult.getProductDetailsList()) {
                products.put(detail.getProductId(), detail);
                List<ProductDetails.SubscriptionOfferDetails> offers = detail.getSubscriptionOfferDetails();
                ProductDetails.PricingPhase phase = offers == null || offers.isEmpty() ? null : offers.get(0).getPricingPhases().getPricingPhaseList().get(0);
                JSObject item = new JSObject(); item.put("sku", detail.getProductId()); item.put("provider", "google"); item.put("productId", detail.getProductId());
                item.put("displayPrice", phase == null ? null : phase.getFormattedPrice()); item.put("currencyCode", phase == null ? null : phase.getPriceCurrencyCode());
                item.put("period", detail.getProductId().endsWith("annual") ? "annual" : "monthly"); item.put("available", true); response.put(item);
            }
            JSObject payload = new JSObject(); payload.put("products", response); call.resolve(payload);
        }), call);
    }

    @PluginMethod public void purchase(PluginCall call) {
        String productId = call.getString("productId"), account = call.getString("appAccountToken"); ProductDetails detail = products.get(productId);
        if (!allowed(productId) || account == null || detail == null) { call.reject("Produit Google Play indisponible."); return; }
        List<ProductDetails.SubscriptionOfferDetails> offers = detail.getSubscriptionOfferDetails();
        if (offers == null || offers.isEmpty()) { call.reject("Offre Google Play indisponible."); return; }
        BillingFlowParams.ProductDetailsParams product = BillingFlowParams.ProductDetailsParams.newBuilder().setProductDetails(detail).setOfferToken(offers.get(0).getOfferToken()).build();
        purchaseCall = call;
        BillingFlowParams params = BillingFlowParams.newBuilder().setProductDetailsParamsList(List.of(product)).setObfuscatedAccountId(opaqueAccount(account)).build();
        BillingResult result = billingClient.launchBillingFlow(getActivity(), params);
        if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) { purchaseCall = null; call.reject("Achat Google Play impossible."); }
    }
    private JSObject payload(Purchase purchase) {
        JSObject value = new JSObject(); value.put("provider", "google"); value.put("productId", purchase.getProducts().isEmpty() ? "" : purchase.getProducts().get(0));
        value.put("purchaseToken", purchase.getPurchaseToken()); value.put("pending", purchase.getPurchaseState() == Purchase.PurchaseState.PENDING); return value;
    }
    @Override public void onPurchasesUpdated(BillingResult result, List<Purchase> purchases) {
        if (purchaseCall == null) return; PluginCall call = purchaseCall; purchaseCall = null;
        if (result.getResponseCode() == BillingClient.BillingResponseCode.USER_CANCELED) { call.reject("Achat annulé.", "USER_CANCELLED"); return; }
        if (result.getResponseCode() != BillingClient.BillingResponseCode.OK || purchases == null || purchases.isEmpty()) { call.reject("Achat Google Play impossible."); return; }
        call.resolve(payload(purchases.get(0)));
    }
    @PluginMethod public void restore(PluginCall call) {
        connected(() -> billingClient.queryPurchasesAsync(QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.SUBS).build(), (result, purchases) -> {
            JSArray restored = new JSArray(); for (Purchase purchase : purchases) restored.put(payload(purchase)); JSObject response = new JSObject(); response.put("purchases", restored); call.resolve(response);
        }), call);
    }
    @PluginMethod public void finish(PluginCall call) { call.resolve(); }
}
