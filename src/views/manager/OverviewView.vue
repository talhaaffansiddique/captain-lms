<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const teamSize = ref(0)

onMounted(async () => {
  const dept = auth.profile?.department
  if (!dept) return
  const { count } = await supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .eq('department', dept)
  teamSize.value = count ?? 0
})
</script>

<template>
  <div>
    <div class="topline">
      <div>
        <h2>Team Overview</h2>
        <p>Read-only — {{ auth.profile?.department }}</p>
      </div>
    </div>
    <div class="card stat" style="max-width: 200px">
      <div class="lbl">Team size</div>
      <div class="val">{{ teamSize }}</div>
    </div>
  </div>
</template>
