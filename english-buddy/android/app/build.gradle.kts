import java.util.Properties
import com.google.gms.googleservices.GoogleServicesTask
import java.io.File
import java.nio.file.Files
import java.nio.file.attribute.PosixFilePermission

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Firebase configuration stays outside source control. Prefer passing its
// absolute path with -PgoogleServicesFile; the ignored local path remains a
// convenience for Android Studio.
val externalGoogleServices = providers.gradleProperty("googleServicesFile")
    .orNull
    ?.let(::file)
val googleServicesFile = externalGoogleServices ?: file("google-services.json")
if (googleServicesFile.isFile) {
    apply(plugin = "com.google.gms.google-services")
    afterEvaluate {
        tasks.withType<GoogleServicesTask>().configureEach {
            googleServicesJsonFiles.set(listOf(googleServicesFile))
        }
    }
} else {
    logger.warn("google-services.json is absent: this build will compile, but FCM is not configured.")
}

val signingProperties = Properties()
val signingPropertiesFile = providers.gradleProperty("keystorePropertiesFile")
    .orNull
    ?.let(rootProject::file)
    ?: rootProject.file("keystore.properties")
if (signingPropertiesFile.isFile) {
    signingPropertiesFile.inputStream().use(signingProperties::load)
}

data class ReleaseSigningMaterial(
    val storeFile: File,
    val storePassword: String,
    val keyAlias: String,
    val keyPassword: String,
)

fun readPasswordFile(file: File): String {
    require(file.isFile) { "The configured upload password file is missing or is not a regular file." }
    runCatching { Files.getPosixFilePermissions(file.toPath()) }.getOrNull()?.let { permissions ->
        val forbidden = setOf(
            PosixFilePermission.GROUP_READ,
            PosixFilePermission.GROUP_WRITE,
            PosixFilePermission.GROUP_EXECUTE,
            PosixFilePermission.OTHERS_READ,
            PosixFilePermission.OTHERS_WRITE,
            PosixFilePermission.OTHERS_EXECUTE,
        )
        require(permissions.none(forbidden::contains)) {
            "The upload password file must be private to its owner (mode 600 or stricter)."
        }
    }
    return file.readText(Charsets.UTF_8)
        .trimEnd('\r', '\n')
        .takeIf(String::isNotEmpty)
        ?: error("The configured upload password file is empty.")
}

val externalUploadKeystore = providers.gradleProperty("uploadKeystoreFile")
    .orNull
    ?.let(rootProject::file)
val externalUploadPasswordFile = providers.gradleProperty("uploadPasswordFile")
    .orNull
    ?.let(rootProject::file)
val externalUploadKeyPasswordFile = providers.gradleProperty("uploadKeyPasswordFile")
    .orNull
    ?.let(rootProject::file)
    ?: externalUploadPasswordFile
val externalSigningRequested = externalUploadKeystore != null || externalUploadPasswordFile != null

val releaseSigningMaterial: ReleaseSigningMaterial? = when {
    externalSigningRequested -> {
        val keystore = requireNotNull(externalUploadKeystore) {
            "-PuploadKeystoreFile is required when external release signing is enabled."
        }
        require(keystore.isFile) {
            "The configured upload keystore is missing or is not a regular file."
        }
        val storePasswordFile = requireNotNull(externalUploadPasswordFile) {
            "-PuploadPasswordFile is required when external release signing is enabled."
        }
        val keyPasswordFile = requireNotNull(externalUploadKeyPasswordFile)
        ReleaseSigningMaterial(
            storeFile = keystore,
            storePassword = readPasswordFile(storePasswordFile),
            keyAlias = providers.gradleProperty("uploadKeyAlias").orNull ?: "execlingo",
            keyPassword = readPasswordFile(keyPasswordFile),
        )
    }
    signingPropertiesFile.isFile -> ReleaseSigningMaterial(
        storeFile = rootProject.file(signingProperties.getProperty("storeFile")),
        storePassword = signingProperties.getProperty("storePassword"),
        keyAlias = signingProperties.getProperty("keyAlias"),
        keyPassword = signingProperties.getProperty("keyPassword"),
    )
    else -> null
}

android {
    namespace = "it.execlingo.app"
    compileSdk = 36

    defaultConfig {
        applicationId = "it.execlingo.app"
        minSdk = 23
        targetSdk = 36
        versionCode = 12
        versionName = "1.1.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        vectorDrawables.useSupportLibrary = true
    }

    signingConfigs {
        releaseSigningMaterial?.let { material ->
            create("release") {
                storeFile = material.storeFile
                storePassword = material.storePassword
                keyAlias = material.keyAlias
                keyPassword = material.keyPassword
            }
        }
    }

    buildTypes {
        debug {
            versionNameSuffix = "-debug"
        }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
            signingConfig = signingConfigs.findByName("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        buildConfig = true
        viewBinding = true
    }

    testOptions {
        unitTests.isIncludeAndroidResources = true
    }

    packaging {
        resources.excludes += setOf(
            "META-INF/AL2.0",
            "META-INF/LGPL2.1",
        )
    }
}

kotlin {
    jvmToolchain(17)
}

dependencies {
    implementation("androidx.activity:activity-ktx:1.12.3")
    implementation("androidx.appcompat:appcompat:1.7.1")
    implementation("androidx.core:core-ktx:1.17.0")
    // 1.16+ requires minSdk 24. Version 1.15 keeps ExecLingo's minSdk 23 and
    // still provides the origin-scoped WebMessageListener bridge.
    implementation("androidx.webkit:webkit:1.15.0")

    implementation("com.android.billingclient:billing-ktx:9.1.0")
    implementation("com.android.installreferrer:installreferrer:2.2")

    implementation(platform("com.google.firebase:firebase-bom:34.18.0"))
    // Native analytics has no consent flow in this release. Do not restore
    // firebase-analytics until a dedicated release implements that flow.
    // FCM and Install Referrer do not require the Analytics SDK or AD_ID.
    implementation("com.google.firebase:firebase-installations")
    implementation("com.google.firebase:firebase-messaging")

    testImplementation("junit:junit:4.13.2")
    testImplementation("androidx.test:core:1.7.0")
    testImplementation("org.robolectric:robolectric:4.16.1")
}
