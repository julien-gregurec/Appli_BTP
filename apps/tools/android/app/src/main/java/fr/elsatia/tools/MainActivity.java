package fr.elsatia.tools;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(SecureSessionPlugin.class);
        registerPlugin(NativeBillingPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
