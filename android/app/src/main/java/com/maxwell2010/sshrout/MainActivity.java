package com.maxwell2010.sshrout;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(SSHRoutePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
