import { Tabs } from 'expo-router';
import { BarChart3, BookOpen, CreditCard, Download, ReceiptText, Settings, Users } from 'lucide-react-native';

export default function TabLayout() {
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: '#1f6f4a', headerStyle: { backgroundColor: '#fffdf7' }, headerTitleStyle: { color: '#17211b', fontWeight: '900' }, tabBarStyle: { backgroundColor: '#fffdf7' } }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color, size }) => <BarChart3 color={color} size={size} />,
        }}
      />
      <Tabs.Screen name="students" options={{ title: 'Students', tabBarIcon: ({ color, size }) => <Users color={color} size={size} /> }} />
      <Tabs.Screen name="payments" options={{ title: 'Payments', tabBarIcon: ({ color, size }) => <CreditCard color={color} size={size} /> }} />
      <Tabs.Screen name="expenses" options={{ title: 'Expenses', tabBarIcon: ({ color, size }) => <ReceiptText color={color} size={size} /> }} />
      <Tabs.Screen name="reports" options={{ title: 'Reports', tabBarIcon: ({ color, size }) => <BookOpen color={color} size={size} /> }} />
      <Tabs.Screen name="import-export" options={{ title: 'Import/Export', tabBarIcon: ({ color, size }) => <Download color={color} size={size} /> }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings', tabBarIcon: ({ color, size }) => <Settings color={color} size={size} /> }} />
    </Tabs>
  );
}
