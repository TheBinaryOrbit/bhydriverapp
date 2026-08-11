package com.xcentic.bhy.appinfo

import com.facebook.react.bridge.ReactApplicationContext
import com.xcentic.bhy.BuildConfig
import com.xcentic.bhy.specs.NativeAppInfoSpec

/**
 * The build this binary is, straight from `BuildConfig`.
 *
 * Three synchronous reads of compile-time constants — there is nothing to await
 * and nothing that can fail, and the update gate wants the answer on the first
 * render rather than a frame later. See `NativeAppInfo` for why this is a native
 * module at all instead of a number typed into JS.
 */
class AppInfoModule(reactContext: ReactApplicationContext) :
    NativeAppInfoSpec(reactContext) {

  companion object {
    const val NAME = "AppInfo"
  }

  override fun getName(): String = NAME

  override fun getVersion(): String = BuildConfig.VERSION_NAME

  // `Double` because that is what a TypeScript `number` becomes on the way
  // across; `versionCode` is an Int and survives the trip exactly.
  override fun getBuildNumber(): Double = BuildConfig.VERSION_CODE.toDouble()

  override fun getPackageName(): String = BuildConfig.APPLICATION_ID
}
