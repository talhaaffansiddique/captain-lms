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
    <div class="topline">
      <div><h2>Employees</h2></div>
    </div>
    <div class="card table-wrap">
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Department</th>
            <th>Role</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="e in employees" :key="e.id">
            <td style="font-weight: 600">
              <RouterLink :to="`/admin/employees/${e.id}`" style="display: flex; align-items: center; gap: 10px; text-decoration: none">
                <div class="avatar" style="width: 26px; height: 26px; font-size: 11px">
                  {{ e.full_name.slice(0, 2).toUpperCase() }}
                </div>
                {{ e.full_name }}
              </RouterLink>
            </td>
            <td>{{ e.department }}</td>
            <td><span class="pill pill-outline">{{ e.role }}</span></td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
