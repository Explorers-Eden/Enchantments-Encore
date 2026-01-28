##cleanup
scoreboard objectives remove enchantencore.leaf_jumper
scoreboard objectives remove enchantencore.pegasus
scoreboard objectives remove enchantencore.sneaktime

##add scoreboards
scoreboard objectives add enchantencore.sneaktime minecraft.custom:minecraft.sneak_time
scoreboard objectives add enchantencore.technical dummy
scoreboard objectives add enchantencore.leaf_jumper dummy
scoreboard objectives add enchantencore.pegasus dummy
scoreboard objectives add enchantencore.idle_time dummy
scoreboard objectives add enchantencore.dialog_trigger.wiki trigger {"bold":false,"color":"dark_purple","italic":false,"text":"Enchantments Encore: Wiki"}
scoreboard objectives add enchantencore.strafe.timer dummy

##set data pack version
data modify storage eden:datapack enchantments_encore.version set value "4.1"