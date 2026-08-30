package fr.elsatia.tools;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

@CapacitorPlugin(name = "SecureSession")
public class SecureSessionPlugin extends Plugin {
    private static final String ALIAS = "fr.elsatia.tools.session.v1";
    private static final String PREFERENCES = "elsatia_tools_secure_session";

    private SecretKey key() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        if (store.containsAlias(ALIAS)) return ((KeyStore.SecretKeyEntry) store.getEntry(ALIAS, null)).getSecretKey();
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
        return generator.generateKey();
    }

    private SharedPreferences preferences() { return getContext().getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE); }

    @PluginMethod
    public void set(PluginCall call) {
        String storageKey = call.getString("key"); String value = call.getString("value");
        if (storageKey == null || value == null) { call.reject("Clé ou valeur manquante."); return; }
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.ENCRYPT_MODE, key());
            byte[] encrypted = cipher.doFinal(value.getBytes(StandardCharsets.UTF_8));
            String payload = Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP) + "." + Base64.encodeToString(encrypted, Base64.NO_WRAP);
            preferences().edit().putString(storageKey, payload).apply(); call.resolve();
        } catch (Exception error) { call.reject("Stockage sécurisé indisponible.", error); }
    }

    @PluginMethod
    public void get(PluginCall call) {
        String storageKey = call.getString("key");
        if (storageKey == null) { call.reject("Clé manquante."); return; }
        JSObject result = new JSObject(); String payload = preferences().getString(storageKey, null);
        if (payload == null) { result.put("value", null); call.resolve(result); return; }
        try {
            String[] parts = payload.split("\\.", 2); Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP)));
            result.put("value", new String(cipher.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)), StandardCharsets.UTF_8)); call.resolve(result);
        } catch (Exception error) { preferences().edit().remove(storageKey).apply(); call.reject("Session sécurisée invalide.", error); }
    }

    @PluginMethod
    public void remove(PluginCall call) {
        String storageKey = call.getString("key");
        if (storageKey != null) preferences().edit().remove(storageKey).apply();
        call.resolve();
    }
}
