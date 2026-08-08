package com.xcentic.bhy

import android.app.Application
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.xcentic.bhy.duty.AppForeground
import com.xcentic.bhy.duty.DutyPackage
import com.xcentic.bhy.permissions.DriverPermissionsPackage

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          // These live in the app rather than node_modules, so autolinking
          // never sees them.
          add(DriverPermissionsPackage())
          add(DutyPackage())
        },
    )
  }

  override fun onCreate() {
    super.onCreate()
    // Here rather than in `DutyService`, which is created long after the first
    // activity has resumed and would start out believing nothing is on screen.
    registerActivityLifecycleCallbacks(AppForeground)
    loadReactNative(this)
  }
}
