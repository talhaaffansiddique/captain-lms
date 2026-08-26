<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { supabase } from '@/lib/supabase'
import type { Profile } from '@/lib/database.types'

const employees = ref<Profile[]>([])

onMounted(async () => {
  const { data } = await supabase.from('profiles').select('*').order('full_name')
  employees.value = data ?? []
})
</script>

<template>
  <div>
    <h2 style="font-size: 23px; margin-bottom: 16px">Employees</h2>
    <div class="card">
      <table style="width: 100%; border-collapse: collapse; font-size: 13.5px">
        <thead>
          <tr>
            <th style="text-align: left; padding: 10px 16px; border-bottom: 1px solid var(--border)">Name</th>
            <th style="text-align: left; padding: 10px 16px; border-bottom: 1px solid var(--border)">Department</th>
            <th style="text-align: left; padding: 10px 16px; border-bottom: 1px solid var(--border)">Role</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="e in employees" :key="e.id">
            <td style="padding: 12px 16px; border-bottom: 1px solid var(--border)">{{ e.full_name }}</td>
            <td style="padding: 12px 16px; border-bottom: 1px solid var(--border)">{{ e.department }}</td>
            <td style="padding: 12px 16px; border-bottom: 1px solid var(--border)">{{ e.role }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
