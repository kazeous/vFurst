"use client";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type TrendPoint = {
  date: string;
  registrations?: number;
  checkIns?: number;
};

type RevenuePoint = {
  name: string;
  value: number;
};

type CapacityPoint = {
  name: string;
  registered: number;
  capacity: number;
};

const colors = ["#3279f6", "#16a34a", "#f59e0b", "#d946ef", "#0891b2"];

export function AnalyticsCharts({
  registrationTrend,
  checkInTrend,
  revenue,
  capacity
}: {
  registrationTrend: TrendPoint[];
  checkInTrend: TrendPoint[];
  revenue: RevenuePoint[];
  capacity: CapacityPoint[];
}) {
  return (
    <div className="vf-analytics-grid">
      <section className="vf-section">
        <h2>Registration trend</h2>
        <div className="vf-chart">
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={registrationTrend} margin={{ top: 12, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Area type="monotone" dataKey="registrations" stroke="#3279f6" fill="#d8e7ff" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>
      <section className="vf-section">
        <h2>Revenue by source</h2>
        <div className="vf-chart">
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={revenue} dataKey="value" nameKey="name" outerRadius={90} label>
                {revenue.map((entry, index) => (
                  <Cell key={entry.name} fill={colors[index % colors.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </section>
      <section className="vf-section">
        <h2>Check-in rate</h2>
        <div className="vf-chart">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={checkInTrend} margin={{ top: 12, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Line type="monotone" dataKey="checkIns" stroke="#16a34a" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>
      <section className="vf-section">
        <h2>Capacity utilization</h2>
        <div className="vf-chart">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={capacity} margin={{ top: 12, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="registered" fill="#3279f6" />
              <Bar dataKey="capacity" fill="#d1d5db" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
}
