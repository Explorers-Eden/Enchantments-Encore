schedule function enchantencore:guard 10t

execute as @a[predicate=enchantencore:entity/has_guard_mainhand] run item modify entity @s weapon.mainhand enchantencore:guard_components
execute as @a[predicate=enchantencore:entity/has_guard_offhand] run item modify entity @s weapon.offhand enchantencore:guard_components

execute as @a if items entity @s weapon.mainhand #enchantencore:can_block[minecraft:custom_data~{enchantencore:"has_guard"}] unless predicate enchantencore:entity/has_guard_mainhand run item modify entity @s weapon.mainhand enchantencore:remove_guard_components
execute as @a if items entity @s weapon.offhand #enchantencore:can_block[minecraft:custom_data~{enchantencore:"has_guard"}] unless predicate enchantencore:entity/has_guard_offhand run item modify entity @s weapon.offhand enchantencore:remove_guard_components