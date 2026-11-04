package com.valid.vault;

import android.app.Activity;
import android.content.Context;
import android.view.Window;
import android.view.WindowManager;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.IOException;

@CapacitorPlugin(name = "ScreenPrivacy")
public class ScreenPrivacy extends Plugin {

    private static final String ALLOW_FILE = "screenshots_allowed";
    private static final String SAVE_FAILED = "Could not save the screenshot setting";

    static boolean screenshotsAllowed(Context context) {
        return new File(context.getFilesDir(), ALLOW_FILE).exists();
    }

    static void apply(Activity activity) {
        Window window = activity.getWindow();
        if (window == null) return;
        if (screenshotsAllowed(activity)) window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE);
        else window.addFlags(WindowManager.LayoutParams.FLAG_SECURE);
    }

    private static void store(Context context, boolean allowed) throws IOException {
        File file = new File(context.getFilesDir(), ALLOW_FILE);
        if (allowed) {
            if (!file.exists() && !file.createNewFile()) throw new IOException(SAVE_FAILED);
        } else if (file.exists() && !file.delete()) {
            throw new IOException(SAVE_FAILED);
        }
    }

    private JSObject state() {
        JSObject result = new JSObject();
        result.put("allowed", screenshotsAllowed(getContext()));
        return result;
    }

    @PluginMethod
    public void status(PluginCall call) {
        call.resolve(state());
    }

    @PluginMethod
    public void setAllowed(PluginCall call) {
        Boolean allowed = call.getBoolean("allowed");
        if (allowed == null) {
            call.reject(SAVE_FAILED);
            return;
        }
        try {
            store(getContext(), allowed);
        } catch (IOException e) {
            call.reject(SAVE_FAILED);
            return;
        }
        Activity activity = getActivity();
        if (activity != null) activity.runOnUiThread(() -> apply(activity));
        call.resolve(state());
    }
}
