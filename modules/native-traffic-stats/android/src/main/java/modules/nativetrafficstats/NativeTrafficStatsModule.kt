package modules.nativetrafficstats

import android.net.TrafficStats
import android.os.Process
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class NativeTrafficStatsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("NativeTrafficStats")

    Function("getAppTrafficBytes") {
      val uid = Process.myUid()
      val rx = TrafficStats.getUidRxBytes(uid)
      val tx = TrafficStats.getUidTxBytes(uid)
      
      // Return -1 if not supported/available
      mapOf(
        "rxBytes" to if (rx == TrafficStats.UNSUPPORTED.toLong()) -1L else rx,
        "txBytes" to if (tx == TrafficStats.UNSUPPORTED.toLong()) -1L else tx
      )
    }
  }
}
