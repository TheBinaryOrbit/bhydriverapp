package com.xcentic.bhy.permissions

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider

/**
 * Registers [DriverPermissionsModule]. Added by hand in `MainApplication` —
 * autolinking only covers node_modules packages, and this one lives in the app.
 */
class DriverPermissionsPackage : BaseReactPackage() {

  override fun getModule(
      name: String,
      reactContext: ReactApplicationContext,
  ): NativeModule? =
      if (name == DriverPermissionsModule.NAME) DriverPermissionsModule(reactContext) else null

  override fun getReactModuleInfoProvider(): ReactModuleInfoProvider = ReactModuleInfoProvider {
    mapOf(
        DriverPermissionsModule.NAME to
            ReactModuleInfo(
                DriverPermissionsModule.NAME,
                DriverPermissionsModule.NAME,
                /* canOverrideExistingModule = */ false,
                /* needsEagerInit = */ false,
                /* isCxxModule = */ false,
                /* isTurboModule = */ true,
            )
    )
  }
}
