<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import type { Profile } from '@/lib/database.types'

const auth = useAuthStore()
const team = ref<Profile[]>([])

onMounted(async () => {
  const dept = auth.profile?.department
  if (!dept) return
  const { data } = await supabase.from('profiles').select('*').eq('department', dept).order('full_name')
  team.value = data ?? []
})
</script>

<template>
  <div>
    <h2 style="font-size: 23px; margin-bottom: 16px">My Team</h2>
    <div class="card">
      <div
        v-for="p in team"
        :key="p.id"
        style="padding: 12px 16px; border-top: 1px solid var(--border); font: 600 13.5px 'Public Sans'"
      >
        {{ p.full_name }}
      </div>
    </div>
  </div>
</template>
