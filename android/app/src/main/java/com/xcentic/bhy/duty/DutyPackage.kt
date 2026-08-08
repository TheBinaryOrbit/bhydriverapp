package com.xcentic.bhy.duty

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider
import com.xcentic.bhy.overlay.RideOverlayModule

/**
 * Registers the two modules that keep a shift running while the driver is not
 * looking at the app: [DutyServiceModule] holds the process open, and
 * [RideOverlayModule] puts the request in front of them when it does. Added by
 * hand in `MainApplication` — autolinking only covers node_modules packages.
 */
class DutyPackage : BaseReactPackage() {

  override fun getModule(
      name: String,
      reactContext: ReactApplicationContext,
  ): NativeModule? =
      when (name) {
        DutyServiceModule.NAME -> DutyServiceModule(reactContext)
        RideOverlayModule.NAME -> RideOverlayModule(reactContext)
        else -> null
      }

  override fun getReactModuleInfoProvider(): ReactModuleInfoProvider = ReactModuleInfoProvider {
    listOf(DutyServiceModule.NAME, RideOverlayModule.NAME).associateWith { name ->
      ReactModuleInfo(
          name,
          name,
          /* canOverrideExistingModule = */ false,
          /* needsEagerInit = */ false,
          /* isCxxModule = */ false,
          /* isTurboModule = */ true,
      )
    }
  }
}
