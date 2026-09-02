import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import capacitorConfig from "../../capacitor.config";

const iosInfoPlist = readFileSync(
  resolve(__dirname, "../../ios/App/App/Info.plist"),
  "utf8",
);
const androidManifest = readFileSync(resolve(__dirname, "../../android/app/src/main/AndroidManifest.xml"), "utf8");
const androidPaths = readFileSync(resolve(__dirname, "../../android/app/src/main/res/xml/file_paths.xml"), "utf8");

describe("configuration native canonique", () => {
  it("embarque l’export statique sous le même identifiant iOS et Android", () => {
    expect(capacitorConfig.appId).toBe("fr.elsatia.tools");
    expect(capacitorConfig.appName).toBe("ELSATIA Tools");
    expect(capacitorConfig.webDir).toBe("out");
  });

  it("n’utilise jamais un serveur distant comme source de l’application", () => {
    expect(capacitorConfig.server).not.toHaveProperty("url");
    expect(capacitorConfig.server?.hostname).toBe("localhost");
    expect(capacitorConfig.android?.allowMixedContent).toBe(false);
    expect(capacitorConfig.android).not.toHaveProperty("webContentsDebuggingEnabled");
  });

  it("laisse les permissions natives absentes tant qu’une capacité ne les exige pas", () => {
    expect(capacitorConfig.ios?.contentInset).toBe("never");
    expect(capacitorConfig.ios?.preferredContentMode).toBe("mobile");
    expect(capacitorConfig.zoomEnabled).toBe(false);
    expect(capacitorConfig.loggingBehavior).toBe("none");
    expect(androidManifest.match(/uses-permission/g)).toHaveLength(1);
    expect(androidManifest).toContain("android.permission.INTERNET");
    expect(androidManifest).toContain('android:allowBackup="false"');
    expect(androidPaths).not.toContain("external-path");
  });
  it("déclare uniquement le deep link de récupération contrôlé", () => {
    expect(iosInfoPlist).toContain("fr.elsatia.tools.auth");
    expect(androidManifest).toContain('android:scheme="fr.elsatia.tools"');
    expect(androidManifest).toContain('android:pathPrefix="/recovery"');
    expect(iosInfoPlist).not.toContain("armv7");
  });

  it("déclare le format de projet portable dans le sélecteur de documents iOS", () => {
    expect(iosInfoPlist).toContain("fr.elsatia.tools.project");
    expect(iosInfoPlist).toContain("elsatiatools");
    expect(iosInfoPlist).toContain("application/vnd.elsatia.tools+json");
    expect(iosInfoPlist).toContain("public.json");
    expect(iosInfoPlist).toMatch(
      /<key>LSSupportsOpeningDocumentsInPlace<\/key>\s*<false\/>/,
    );
  });
});
